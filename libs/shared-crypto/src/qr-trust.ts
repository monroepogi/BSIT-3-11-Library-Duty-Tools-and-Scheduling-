import type {
  ApiErrorCode,
  DutyCertificateDto,
  OicAttendanceReceiptDto,
  StudentPassCertificateDto,
  StudentQrPayloadDto,
  TrustPublicKeyDto,
} from '@vits/shared-types';
import { signCanonicalPayload, verifyCanonicalPayload } from './ed25519';

export interface TrustVerificationResult {
  valid: boolean;
  code?: ApiErrorCode;
  reason?: string;
}

export type UnsignedStudentPassCert = Omit<StudentPassCertificateDto, 'signature'>;
export type UnsignedDutyCert = Omit<DutyCertificateDto, 'signature'>;

export function signStudentPassCert(
  unsignedCert: UnsignedStudentPassCert,
  serverPrivateKeyB64: string,
): StudentPassCertificateDto {
  return {
    ...unsignedCert,
    signature: signCanonicalPayload(unsignedCert, serverPrivateKeyB64),
  };
}

export function verifyStudentPassCert(
  cert: StudentPassCertificateDto,
  trustKeys: TrustPublicKeyDto[],
  nowMs: number = Date.now(),
): TrustVerificationResult {
  const key = trustKeys.find((k) => k.kid === cert.kid);
  if (!key) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: `Unknown server key kid "${cert.kid}".` };
  }
  const { signature, ...unsigned } = cert;
  if (!verifyCanonicalPayload(unsigned, signature, key.publicKey)) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'Invalid student certificate signature.' };
  }
  const fromMs = Date.parse(cert.validFrom);
  const toMs = Date.parse(cert.validTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || nowMs < fromMs || nowMs > toMs) {
    return { valid: false, code: 'QR_EXPIRED_ROTATION', reason: 'Student pass certificate is expired or not yet active.' };
  }
  return { valid: true };
}

export function signOicDutyCert(
  unsignedCert: UnsignedDutyCert,
  serverPrivateKeyB64: string,
): DutyCertificateDto {
  return {
    ...unsignedCert,
    signature: signCanonicalPayload(unsignedCert, serverPrivateKeyB64),
  };
}

export function verifyOicDutyCert(
  cert: DutyCertificateDto,
  trustKeys: TrustPublicKeyDto[],
  nowMs: number = Date.now(),
): TrustVerificationResult {
  const key = trustKeys.find((k) => k.kid === cert.kid);
  if (!key) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: `Unknown server key kid "${cert.kid}".` };
  }
  const { signature, ...unsigned } = cert;
  if (!verifyCanonicalPayload(unsigned, signature, key.publicKey)) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'Invalid OIC duty certificate signature.' };
  }
  const fromMs = Date.parse(cert.validFrom);
  const toMs = Date.parse(cert.validTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || nowMs < fromMs || nowMs > toMs) {
    return { valid: false, code: 'QR_EXPIRED_ROTATION', reason: 'OIC duty certificate is expired or not yet active.' };
  }
  return { valid: true };
}

export function signStudentQrPayload(
  cert: StudentPassCertificateDto,
  studentPrivateKeyB64: string,
  ts: number,
  nonce: string,
): StudentQrPayloadDto {
  const body = { version: 1 as const, cert, ts, nonce };
  return {
    ...body,
    sig: signCanonicalPayload(body, studentPrivateKeyB64),
  };
}

export function verifyStudentQrPayload(
  qr: StudentQrPayloadDto,
  trustKeys: TrustPublicKeyDto[],
  nowMs: number = Date.now(),
  toleranceMs = 60_000,
): TrustVerificationResult {
  if (!qr || qr.version !== 1 || !qr.cert || !qr.nonce || !qr.sig) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'Malformed student QR payload.' };
  }
  const certCheck = verifyStudentPassCert(qr.cert, trustKeys, nowMs);
  if (!certCheck.valid) return certCheck;

  const body = { version: qr.version, cert: qr.cert, ts: qr.ts, nonce: qr.nonce };
  if (!verifyCanonicalPayload(body, qr.sig, qr.cert.studentDevicePubkey)) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'Student QR device signature verification failed.' };
  }
  if (Math.abs(nowMs - qr.ts) > toleranceMs) {
    return { valid: false, code: 'QR_EXPIRED_ROTATION', reason: 'Student QR rotation code expired (> 60s window).' };
  }
  return { valid: true };
}

export function signOicAttendanceReceipt(
  oicCert: DutyCertificateDto,
  studentQr: StudentQrPayloadDto,
  action: 'IN' | 'OUT',
  oicPrivateKeyB64: string,
  timing: { oicTs: number; oicMonoMs: number; bootId: string },
): OicAttendanceReceiptDto {
  const body = {
    version: 1 as const,
    oicCert,
    studentQr,
    action,
    oicTs: timing.oicTs,
    oicMonoMs: timing.oicMonoMs,
    bootId: timing.bootId,
  };
  return {
    ...body,
    oicSig: signCanonicalPayload(body, oicPrivateKeyB64),
  };
}

export function verifyOicAttendanceReceipt(
  receipt: OicAttendanceReceiptDto,
  trustKeys: TrustPublicKeyDto[],
  verificationTimeMs: number = Date.now(),
  toleranceMs = 90_000,
): TrustVerificationResult {
  if (!receipt || receipt.version !== 1 || !receipt.oicCert || !receipt.studentQr || !receipt.oicSig) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'Malformed OIC attendance receipt.' };
  }

  const oicCertCheck = verifyOicDutyCert(receipt.oicCert, trustKeys, receipt.oicTs || verificationTimeMs);
  if (!oicCertCheck.valid) return oicCertCheck;

  const receiptBody = {
    version: receipt.version,
    oicCert: receipt.oicCert,
    studentQr: receipt.studentQr,
    action: receipt.action,
    oicTs: receipt.oicTs,
    oicMonoMs: receipt.oicMonoMs,
    bootId: receipt.bootId,
  };
  if (!verifyCanonicalPayload(receiptBody, receipt.oicSig, receipt.oicCert.oicDevicePubkey)) {
    return { valid: false, code: 'QR_INVALID_SIGNATURE', reason: 'OIC co-signature verification failed.' };
  }

  if (receipt.studentQr.cert.studentId === receipt.oicCert.oicId) {
    return { valid: false, code: 'SELF_ACTION_FORBIDDEN', reason: 'An OIC cannot scan their own student QR.' };
  }

  // Verify the embedded Student QR at the time OIC scanned it (oicTs)
  const studentQrCheck = verifyStudentQrPayload(receipt.studentQr, trustKeys, receipt.oicTs, toleranceMs);
  if (!studentQrCheck.valid) return studentQrCheck;

  return { valid: true };
}
