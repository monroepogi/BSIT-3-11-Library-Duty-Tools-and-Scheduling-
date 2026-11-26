import { HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import type {
  AuthTokensResponseDto,
  EndpointGroup,
  EnvironmentConfig,
} from '@vits/shared-types';

export interface AuthSessionPort {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  updateTokens(tokens: AuthTokensResponseDto): void;
  onSessionInvalidated(reason: 'revoked' | 'expired'): void;
}

export interface NetworkLogEntry {
  method: string;
  url: string;
  correlationId: string;
  durationMs: number;
  status: number;
  errorCode?: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
}

export interface NetworkLogSink {
  log(entry: NetworkLogEntry): void;
}

export const ENVIRONMENT_CONFIG = new InjectionToken<EnvironmentConfig>('VITS_ENVIRONMENT_CONFIG');
export const AUTH_SESSION_PORT = new InjectionToken<AuthSessionPort>('VITS_AUTH_SESSION_PORT');
export const NETWORK_LOG_SINK = new InjectionToken<NetworkLogSink>('VITS_NETWORK_LOG_SINK');

export const ENDPOINT_GROUP_TOKEN = new HttpContextToken<EndpointGroup>(() => 'identity');
export const SKIP_AUTH_TOKEN = new HttpContextToken<boolean>(() => false);
export const REFRESH_RETRIED_TOKEN = new HttpContextToken<boolean>(() => false);

const SENSITIVE_KEY_PATTERN =
  /authorization|token|password|pin|secret|cert|sig|signature|pubkey|qr|rawqrpayload/i;

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('Bearer ') || value.startsWith('vits1.')) {
      return '[REDACTED]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : redactSensitiveValue(v);
    }
    return out;
  }
  return value;
}
