export type ApiErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_UNREACHABLE'
  | 'REQUEST_TIMEOUT'
  | 'CLIENT_UNKNOWN_ERROR'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_FORBIDDEN_CLIENT'
  | 'AUTH_ACCOUNT_INACTIVE'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_REFRESH_EXPIRED'
  | 'AUTH_REFRESH_REVOKED'
  | 'AUTH_REFRESH_REUSED'
  | 'AUTH_INSUFFICIENT_ROLE'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFLICT_DUPLICATE'
  | 'CONFLICT_STATE_TRANSITION'
  | 'SELF_ACTION_FORBIDDEN'
  | 'SECTION_MISMATCH'
  | 'SHIFT_OVERLAP'
  | 'SHIFT_ALREADY_SIGNED_OFF'
  | 'HOUR_CAP_EXCEEDED'
  | 'DUTY_CERT_NOT_ELIGIBLE'
  | 'QR_INVALID_SIGNATURE'
  | 'QR_EXPIRED_ROTATION'
  | 'SHIFT_NOT_ROSTERED'
  | 'ATTACHMENT_INVALID_TYPE'
  | 'ATTACHMENT_TOO_LARGE'
  | 'DISCREPANCY_ALREADY_RESOLVED'
  | 'CSV_IMPORT_INVALID'
  | 'INTERNAL_SERVER_ERROR';

export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    correlationId: string;
    timestamp: string;
    details?: Record<string, string[] | string | number | boolean>;
  };
}

export class VitsApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly envelope: ApiErrorEnvelope;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'VitsApiError';
    this.status = status;
    this.code = envelope.error.code;
    this.correlationId = envelope.error.correlationId;
    this.timestamp = envelope.error.timestamp;
    this.envelope = envelope;
  }
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!candidate['error'] || typeof candidate['error'] !== 'object') return false;
  const err = candidate['error'] as Record<string, unknown>;
  return (
    typeof err['code'] === 'string' &&
    typeof err['message'] === 'string' &&
    typeof err['correlationId'] === 'string'
  );
}
