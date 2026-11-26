import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  type HttpInterceptorFn,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { type EnvironmentProviders, inject, Injector, makeEnvironmentProviders } from '@angular/core';
import {
  type ApiErrorCode,
  type ApiErrorEnvelope,
  type AuthTokensResponseDto,
  type EnvironmentConfig,
  isApiErrorEnvelope,
  VitsApiError,
} from '@vits/shared-types';
import {
  catchError,
  defer,
  finalize,
   Observable,
  of,
  retry,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
  TimeoutError,
  timer,
} from 'rxjs';
import { ConnectivityService } from './connectivity.service';
import { MockApiStore } from './mock-api.store';
import { MockChaosService } from './mock-chaos.service';
import {
  AUTH_SESSION_PORT,
  type AuthSessionPort,
  ENDPOINT_GROUP_TOKEN,
  ENVIRONMENT_CONFIG,
  NETWORK_LOG_SINK,
  redactSensitiveValue,
  REFRESH_RETRIED_TOKEN,
  SKIP_AUTH_TOKEN,
} from './tokens';

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 1. Correlation ID & X-Client-Id Headers
 */
export const correlationInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT_CONFIG);
  const correlationId = req.headers.get('X-Correlation-Id') ?? generateCorrelationId();
  const cloned = req.clone({
    setHeaders: {
      'X-Correlation-Id': correlationId,
      'X-Client-Id': env.clientId,
    },
  });
  return next(cloned);
};

/**
 * 2. Redacted Structured Network Logger (never logs tokens, PINs, certs, or QR payloads)
 */
export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const sink = inject(NETWORK_LOG_SINK, { optional: true });
  const startedAt = Date.now();
  const correlationId = req.headers.get('X-Correlation-Id') ?? 'unknown';

  const safeHeaders: Record<string, string> = {};
  for (const key of req.headers.keys()) {
    const val = req.headers.get(key) ?? '';
    safeHeaders[key] = String(redactSensitiveValue(key.toLowerCase() === 'authorization' ? 'Bearer x' : val));
  }
  const safeBody = req.body ? redactSensitiveValue(req.body) : undefined;

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse && sink) {
          sink.log({
            method: req.method,
            url: req.url,
            correlationId,
            durationMs: Date.now() - startedAt,
            status: event.status,
            requestHeaders: safeHeaders,
            requestBody: safeBody,
          });
        }
      },
      error: (err: unknown) => {
        if (!sink) return;
        const status = err instanceof VitsApiError ? err.status : err instanceof HttpErrorResponse ? err.status : 0;
        const errorCode = err instanceof VitsApiError ? err.code : undefined;
        sink.log({
          method: req.method,
          url: req.url,
          correlationId,
          durationMs: Date.now() - startedAt,
          status,
          errorCode,
          requestHeaders: safeHeaders,
          requestBody: safeBody,
        });
      },
    }),
  );
};

/**
 * 3. Error Mapper: normalizes any error into VitsApiError carrying ApiErrorEnvelope
 */
export const errorMapperInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  const chaos = inject(MockChaosService);
  const correlationId = req.headers.get('X-Correlation-Id') ?? 'unknown';
  const isHealthCheck = req.url.endsWith('/v1/health');

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && !isHealthCheck) {
        injector.get(ConnectivityService).reportApiSuccess();
      }
    }),
    catchError((err: unknown) => {
      if (err instanceof VitsApiError) {
        return throwError(() => err);
      }

      const timestamp = new Date().toISOString();
      if (err instanceof TimeoutError) {
        const envelope: ApiErrorEnvelope = {
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'The library server took too long to respond.',
            correlationId,
            timestamp,
          },
        };
        return throwError(() => new VitsApiError(408, envelope));
      }

      if (err instanceof HttpErrorResponse) {
        if (isApiErrorEnvelope(err.error)) {
          return throwError(() => new VitsApiError(err.status, err.error));
        }

        let code: ApiErrorCode = 'INTERNAL_SERVER_ERROR';
        let message = 'An unexpected server error occurred.';
        if (err.status === 0) {
          const isOffline =
            chaos.forcedOffline() ||
            (typeof navigator !== 'undefined' && navigator.onLine === false);
          code = isOffline ? 'NETWORK_OFFLINE' : 'NETWORK_UNREACHABLE';
          message = isOffline
            ? 'Device is offline. Changes can still be saved locally.'
            : 'Unable to reach the library API server.';
          if (!isHealthCheck && !isOffline) {
            injector.get(ConnectivityService).reportTransportFailure();
          }
        } else if (err.status === 401) {
          code = 'AUTH_TOKEN_EXPIRED';
          message = 'Your session has expired. Please sign in again.';
        } else if (err.status === 403) {
          code = 'AUTH_INSUFFICIENT_ROLE';
          message = 'You do not have permission for this action.';
        } else if (err.status === 404) {
          code = 'RESOURCE_NOT_FOUND';
          message = 'Requested library record was not found.';
        } else if (err.status === 429) {
          code = 'RATE_LIMITED';
          message = 'Too many requests. Please wait a moment.';
        } else if (err.status >= 400 && err.status < 500) {
          code = 'VALIDATION_ERROR';
          message = 'Request validation failed.';
        }

        const envelope: ApiErrorEnvelope = {
          error: { code, message, correlationId, timestamp },
        };
        return throwError(() => new VitsApiError(err.status, envelope));
      }

      const fallback: ApiErrorEnvelope = {
        error: {
          code: 'CLIENT_UNKNOWN_ERROR',
          message: err instanceof Error ? err.message : 'Unexpected client error.',
          correlationId,
          timestamp,
        },
      };
      return throwError(() => new VitsApiError(0, fallback));
    }),
  );
};

function parseRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const raw = err.headers?.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(10_000, seconds * 1000);
  }
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    return Math.min(10_000, Math.max(0, parsedDate - Date.now()));
  }
  return null;
}

/**
 * 4. Idempotent Retry: GET/HEAD ONLY, exponential backoff + full jitter, honors Retry-After
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  const chaos = inject(MockChaosService);
  const method = req.method.toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const isHealth = req.url.endsWith('/v1/health');

  if (!isIdempotent || isHealth) {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: 3,
      delay: (err: unknown, retryCount: number) => {
        const isOffline =
          chaos.forcedOffline() ||
          (typeof navigator !== 'undefined' && navigator.onLine === false);
        if (isOffline) {
          return throwError(() => err);
        }

        const isTimeout = err instanceof TimeoutError;
        const status = err instanceof HttpErrorResponse ? err.status : -1;
        const isRetryableHttp =
          status === 0 || status === 429 || status === 502 || status === 503 || status === 504;

        if (!isTimeout && !isRetryableHttp) {
          return throwError(() => err);
        }

        const retryAfterMs = parseRetryAfterMs(err);
        if (retryAfterMs !== null) {
          return timer(retryAfterMs);
        }

        const capMs = Math.min(5000, 300 * Math.pow(2, retryCount - 1));
        const jitteredMs = Math.floor(Math.random() * (capMs + 1));
        return timer(jitteredMs);
      },
    }),
  );
};

/**
 * 5. Per-Attempt Timeout
 */
export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT_CONFIG);
  return next(req).pipe(timeout(env.requestTimeoutMs));
};

// Module-scoped single-flight refresh stream per session port instance
const inFlightRefreshByPort = new WeakMap<AuthSessionPort, Observable<string>>();

/**
 * 6. Single-Flight 401 Refresh Interceptor
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionPort = inject(AUTH_SESSION_PORT, { optional: true });
  const env = inject(ENVIRONMENT_CONFIG);
  const injector = inject(Injector);

  const isAuthBypassPath =
    req.context.get(SKIP_AUTH_TOKEN) ||
    req.url.endsWith('/v1/auth/login') ||
    req.url.endsWith('/v1/auth/refresh') ||
    req.url.endsWith('/v1/auth/logout') ||
    req.url.endsWith('/v1/health');

  if (!sessionPort || isAuthBypassPath) {
    return next(req);
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        !(err instanceof HttpErrorResponse) ||
        err.status !== 401 ||
        req.context.get(REFRESH_RETRIED_TOKEN)
      ) {
        return throwError(() => err);
      }

      const refreshToken = sessionPort.getRefreshToken();
      if (!refreshToken) {
        sessionPort.onSessionInvalidated('expired');
        return throwError(() => err);
      }

      let refresh$ = inFlightRefreshByPort.get(sessionPort);
      if (!refresh$) {
        const http = injector.get(HttpClient);
        const cleanBase = env.apiBaseUrl.replace(/\/+$/, '');
        refresh$ = http
          .post<AuthTokensResponseDto>(
            `${cleanBase}/v1/auth/refresh`,
            { refreshToken },
            {
              context: new HttpContext()
                .set(SKIP_AUTH_TOKEN, true)
                .set(ENDPOINT_GROUP_TOKEN, 'identity'),
            },
          )
          .pipe(
            tap((tokens) => sessionPort.updateTokens(tokens)),
            switchMap((tokens) => of(tokens.accessToken)),
            catchError((refreshErr: unknown) => {
              const status =
                refreshErr instanceof VitsApiError
                  ? refreshErr.status
                  : refreshErr instanceof HttpErrorResponse
                    ? refreshErr.status
                    : 0;
              if (status === 401 || status === 403) {
                sessionPort.onSessionInvalidated('revoked');
              }
              return throwError(() => refreshErr);
            }),
            finalize(() => {
              inFlightRefreshByPort.delete(sessionPort);
            }),
            shareReplay({ bufferSize: 1, refCount: false }),
          );
        inFlightRefreshByPort.set(sessionPort, refresh$);
      }

      return refresh$.pipe(
        switchMap(() => {
          const retriedReq = req.clone({
            context: req.context.set(REFRESH_RETRIED_TOKEN, true),
          });
          return next(retriedReq);
        }),
      );
    }),
  );
};

/**
 * 7. Auth Bearer Token Attachment
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH_TOKEN)) {
    return next(req);
  }
  const sessionPort = inject(AUTH_SESSION_PORT, { optional: true });
  const token = sessionPort?.getAccessToken();
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};

function emptyPayloadForUrl(url: string): unknown {
  if (url.includes('/me/shifts')) return { shifts: [] };
  if (url.includes('/tasks')) return { tasks: [] };
  if (url.includes('/requests/mine')) return { swapRequests: [], leaveRequests: [] };
  if (url.includes('/visitors')) return { visitors: [] };
  if (url.includes('/baggage')) return { baggage: [] };
  if (url.includes('/papers-borrowed')) return { papers: [] };
  return {};
}

/**
 * 8. Mock API Transport Adapter (only active when useMockApi && mockEndpoints[group])
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT_CONFIG);
  const group = req.context.get(ENDPOINT_GROUP_TOKEN);

  if (!env.useMockApi || !env.mockEndpoints[group]) {
    return next(req);
  }

  const chaos = inject(MockChaosService);
  const store = inject(MockApiStore);
  const correlationId = req.headers.get('X-Correlation-Id') ?? 'mock-corr';

  return defer(() => {
    if (chaos.forcedOffline()) {
      return throwError(
        () => new HttpErrorResponse({ status: 0, statusText: 'Forced Offline', url: req.url }),
      );
    }

    const isRefreshCall = req.url.endsWith('/v1/auth/refresh');
    const isHealthCall = req.url.endsWith('/v1/health');

    if (isRefreshCall && chaos.expireRefreshNext()) {
      chaos.expireRefreshNext.set(false);
      const envelope: ApiErrorEnvelope = {
        error: {
          code: 'AUTH_REFRESH_EXPIRED',
          message: 'Simulated refresh token expiry.',
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
      return throwError(() => new HttpErrorResponse({ status: 401, error: envelope, url: req.url }));
    }

    if (!req.context.get(SKIP_AUTH_TOKEN) && !isHealthCall && chaos.expireAccessNext()) {
      chaos.expireAccessNext.set(false);
      const envelope: ApiErrorEnvelope = {
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'Simulated 401 access token expiry.',
          correlationId,
          timestamp: new Date().toISOString(),
        },
      };
      return throwError(() => new HttpErrorResponse({ status: 401, error: envelope, url: req.url }));
    }

    const delayMs = chaos.slowTimeoutNext()
      ? env.requestTimeoutMs + 1500
      : chaos.latencyMs();
    if (chaos.slowTimeoutNext()) {
      chaos.slowTimeoutNext.set(false);
    }

    return timer(delayMs).pipe(
      switchMap(() => {
        if (!isHealthCall && chaos.failureRate() > 0 && Math.random() < chaos.failureRate()) {
          const envelope: ApiErrorEnvelope = {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Simulated transient 503 failure from Mock Lab.',
              correlationId,
              timestamp: new Date().toISOString(),
            },
          };
          return throwError(
            () => new HttpErrorResponse({ status: 503, error: envelope, url: req.url }),
          );
        }

        if (
          chaos.emptyStateOverride() &&
          req.method.toUpperCase() === 'GET' &&
          !isHealthCall &&
          !req.url.endsWith('/v1/auth/me') &&
          !req.url.includes('/me/hours-summary') &&
          !req.url.includes('/visitor-log/summary')
        ) {
          return of(new HttpResponse({ status: 200, body: emptyPayloadForUrl(req.url) }));
        }

        const rejectSync = chaos.rejectNextSyncOp();
        if (rejectSync && req.url.endsWith('/v1/sync/push')) {
          chaos.rejectNextSyncOp.set(false);
        }

        try {
          const response = store.dispatch(req, rejectSync);
          return of(response);
        } catch (err) {
          return throwError(() => err);
        }
      }),
    );
  });
};

export function provideVitsNetwork(config: EnvironmentConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ENVIRONMENT_CONFIG, useValue: config },
    provideHttpClient(
      withInterceptors([
        correlationInterceptor,
        loggingInterceptor,
        errorMapperInterceptor,
        retryInterceptor,
        timeoutInterceptor,
        refreshInterceptor,
        authInterceptor,
        mockApiInterceptor,
      ]),
    ),
  ]);
}
