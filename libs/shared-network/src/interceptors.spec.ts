import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { type AuthTokensResponseDto, type EnvironmentConfig, VitsApiError } from '@vits/shared-types';
import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api-client.service';
import {
  authInterceptor,
  correlationInterceptor,
  errorMapperInterceptor,
  loggingInterceptor,
  provideVitsNetwork,
  refreshInterceptor,
  retryInterceptor,
  timeoutInterceptor,
} from './interceptors';
import { MockChaosService } from './mock-chaos.service';
import {
  AUTH_SESSION_PORT,
  type AuthSessionPort,
  ENVIRONMENT_CONFIG,
  NETWORK_LOG_SINK,
  type NetworkLogEntry,
} from './tokens';

const TEST_ENV: EnvironmentConfig = {
  production: false,
  clientId: 'mobile',
  apiBaseUrl: 'https://api.vits.test',
  requestTimeoutMs: 120,
  libraryTimezone: 'Asia/Manila',
  useMockApi: false,
  mockEndpoints: {
    health: false,
    identity: false,
    roster: false,
    tasks: false,
    requests: false,
    visitors: false,
    admin: false,
    audit: false,
  },
  enableDevPanel: false,
};

describe('VITS shared-network interceptor chain', () => {
  it('attaches X-Client-Id and X-Correlation-Id headers and redacts sensitive fields in logs', async () => {
    const logs: NetworkLogEntry[] = [];
    const sessionPort: AuthSessionPort = {
      getAccessToken: () => 'secret-access-jwt-123',
      getRefreshToken: () => 'secret-refresh-token-456',
      updateTokens: vi.fn(),
      onSessionInvalidated: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ENVIRONMENT_CONFIG, useValue: TEST_ENV },
        { provide: AUTH_SESSION_PORT, useValue: sessionPort },
        { provide: NETWORK_LOG_SINK, useValue: { log: (e: NetworkLogEntry) => logs.push(e) } },
        provideHttpClient(
          withInterceptors([
            correlationInterceptor,
            loggingInterceptor,
            errorMapperInterceptor,
            retryInterceptor,
            timeoutInterceptor,
            refreshInterceptor,
            authInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });

    const api = TestBed.inject(ApiClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const reqPromise = firstValueFrom(
      api.post(
        '/sync/push',
        {
          password: 'my-secret-password',
          pin: '246810',
          rawQrPayload: 'vits1.eyJjZXJ0IjoiYWJjIn0',
          sig: 'ed25519-sig-secret',
          normalField: 'visible-value',
        },
        { endpointGroup: 'identity' },
      ),
    );

    const req = httpMock.expectOne('https://api.vits.test/v1/sync/push');
    expect(req.request.headers.get('X-Client-Id')).toBe('mobile');
    expect(req.request.headers.get('X-Correlation-Id')).toBeTruthy();
    expect(req.request.headers.get('Authorization')).toBe('Bearer secret-access-jwt-123');
    req.flush({ ok: true });

    await reqPromise;
    expect(logs).toHaveLength(1);
    const serializedLog = JSON.stringify(logs[0]);
    expect(serializedLog).not.toContain('my-secret-password');
    expect(serializedLog).not.toContain('246810');
    expect(serializedLog).not.toContain('vits1.eyJjZXJ0IjoiYWJjIn0');
    expect(serializedLog).not.toContain('ed25519-sig-secret');
    expect(serializedLog).not.toContain('secret-access-jwt-123');
    expect(serializedLog).toContain('visible-value');
    httpMock.verify();
  });

  it('coalesces concurrent 401 errors into a single POST /v1/auth/refresh and replays all queued requests', async () => {
    let currentAccess = 'expired-access-token';
    let currentRefresh = 'valid-refresh-token-1';
    const onInvalidated = vi.fn();

    const sessionPort: AuthSessionPort = {
      getAccessToken: () => currentAccess,
      getRefreshToken: () => currentRefresh,
      updateTokens: (tokens: AuthTokensResponseDto) => {
        currentAccess = tokens.accessToken;
        currentRefresh = tokens.refreshToken;
      },
      onSessionInvalidated: onInvalidated,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ENVIRONMENT_CONFIG, useValue: TEST_ENV },
        { provide: AUTH_SESSION_PORT, useValue: sessionPort },
        provideHttpClient(
          withInterceptors([
            correlationInterceptor,
            errorMapperInterceptor,
            refreshInterceptor,
            authInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });

    const api = TestBed.inject(ApiClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const p1 = firstValueFrom(api.get<{ id: number }>('/me/shifts', { endpointGroup: 'roster' }));
    const p2 = firstValueFrom(api.get<{ id: number }>('/tasks', { endpointGroup: 'tasks' }));
    const p3 = firstValueFrom(api.get<{ id: number }>('/requests/mine', { endpointGroup: 'requests' }));

    const r1 = httpMock.expectOne('https://api.vits.test/v1/me/shifts');
    const r2 = httpMock.expectOne('https://api.vits.test/v1/tasks');
    const r3 = httpMock.expectOne('https://api.vits.test/v1/requests/mine');

    r1.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    r2.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    r3.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    // Exactly ONE refresh request must be in flight
    const refreshReqs = httpMock.match('https://api.vits.test/v1/auth/refresh');
    expect(refreshReqs).toHaveLength(1);
    expect(refreshReqs[0]!.request.body).toEqual({ refreshToken: 'valid-refresh-token-1' });

    refreshReqs[0]!.flush({
      accessToken: 'rotated-access-token-2',
      refreshToken: 'rotated-refresh-token-2',
      expiresInSec: 900,
      user: {
        id: 'usr-1',
        universityId: '2024-1',
        email: 'student@university.edu',
        fullName: 'Maria Santos',
        role: 'student',
        department: 'LIS',
        active: true,
        sectionIds: [],
        sectionNames: [],
      },
    } satisfies AuthTokensResponseDto);

    // All 3 original requests replay with the new rotated access token
    const retry1 = httpMock.expectOne('https://api.vits.test/v1/me/shifts');
    const retry2 = httpMock.expectOne('https://api.vits.test/v1/tasks');
    const retry3 = httpMock.expectOne('https://api.vits.test/v1/requests/mine');

    expect(retry1.request.headers.get('Authorization')).toBe('Bearer rotated-access-token-2');
    expect(retry2.request.headers.get('Authorization')).toBe('Bearer rotated-access-token-2');
    expect(retry3.request.headers.get('Authorization')).toBe('Bearer rotated-access-token-2');

    retry1.flush({ id: 1 });
    retry2.flush({ id: 2 });
    retry3.flush({ id: 3 });

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(onInvalidated).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('invalidates the session when refresh fails with 401', async () => {
    const onInvalidated = vi.fn();
    const sessionPort: AuthSessionPort = {
      getAccessToken: () => 'expired-at',
      getRefreshToken: () => 'revoked-rt',
      updateTokens: vi.fn(),
      onSessionInvalidated: onInvalidated,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ENVIRONMENT_CONFIG, useValue: TEST_ENV },
        { provide: AUTH_SESSION_PORT, useValue: sessionPort },
        provideHttpClient(
          withInterceptors([
            correlationInterceptor,
            errorMapperInterceptor,
            refreshInterceptor,
            authInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });

    const api = TestBed.inject(ApiClient);
    const httpMock = TestBed.inject(HttpTestingController);

    const promise = firstValueFrom(api.get('/me/shifts', { endpointGroup: 'roster' }));
    httpMock
      .expectOne('https://api.vits.test/v1/me/shifts')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    httpMock
      .expectOne('https://api.vits.test/v1/auth/refresh')
      .flush({}, { status: 401, statusText: 'Revoked' });

    await expect(promise).rejects.toBeInstanceOf(VitsApiError);
    expect(onInvalidated).toHaveBeenCalledWith('revoked');
    httpMock.verify();
  });

  it('retries GET on 503 honoring Retry-After, but NEVER retries non-idempotent POST', async () => {
    let getAttempts = 0;
    let postAttempts = 0;

    TestBed.configureTestingModule({
      providers: [
        { provide: ENVIRONMENT_CONFIG, useValue: { ...TEST_ENV, requestTimeoutMs: 2000 } },
        provideHttpClient(
          withInterceptors([
            correlationInterceptor,
            errorMapperInterceptor,
            retryInterceptor,
            (req) =>
              defer(() => {
                if (req.method === 'GET') {
                  getAttempts += 1;
                  if (getAttempts < 2) {
                    return throwError(
                      () =>
                        new HttpErrorResponse({
                          status: 503,
                          headers: new HttpHeaders({ 'Retry-After': '0' }),
                          url: req.url,
                        }),
                    );
                  }
                  return of(new HttpResponse({ status: 200, body: { shifts: ['ok'] } }));
                }
                postAttempts += 1;
                return throwError(() => new HttpErrorResponse({ status: 503, url: req.url }));
              }),
          ]),
        ),
      ],
    });

    const http = TestBed.inject(HttpClient);
    const getRes = await firstValueFrom(
      http.get<{ shifts: string[] }>('https://api.vits.test/v1/me/shifts'),
    );
    expect(getRes.shifts).toEqual(['ok']);
    expect(getAttempts).toBe(2);

    await expect(
      firstValueFrom(http.post('https://api.vits.test/v1/visitors', { visitorName: 'Test' })),
    ).rejects.toBeInstanceOf(VitsApiError);
    expect(postAttempts).toBe(1);
  });

  it('maps forcedOffline to NETWORK_OFFLINE without retrying and maps slow responses to REQUEST_TIMEOUT', async () => {
    const mockEnv: EnvironmentConfig = {
      ...TEST_ENV,
      requestTimeoutMs: 40,
      useMockApi: true,
      mockEndpoints: {
        health: true,
        identity: true,
        roster: true,
        tasks: true,
        requests: true,
        visitors: true,
        admin: true,
        audit: true,
      },
    };

    TestBed.configureTestingModule({
      providers: [provideVitsNetwork(mockEnv)],
    });

    const api = TestBed.inject(ApiClient);
    const chaos = TestBed.inject(MockChaosService);

    chaos.forcedOffline.set(true);
    await expect(
      firstValueFrom(api.get('/me/shifts', { endpointGroup: 'roster' })),
    ).rejects.toMatchObject({
      code: 'NETWORK_OFFLINE',
    });

    chaos.forcedOffline.set(false);
    chaos.slowTimeoutNext.set(true);
    await expect(
      firstValueFrom(api.post('/auth/login', { email: 'a', password: 'b' }, { endpointGroup: 'identity', skipAuth: true })),
    ).rejects.toMatchObject({
      status: 408,
      code: 'REQUEST_TIMEOUT',
    });
  });
});
