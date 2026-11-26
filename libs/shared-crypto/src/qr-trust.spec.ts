import { describe, expect, it } from 'vitest';
import type { TrustPublicKeyDto } from '@vits/shared-types';
import {
  generateEd25519Keypair,
  signOicAttendanceReceipt,
  signOicDutyCert,
  signStudentPassCert,
  signStudentQrPayload,
  verifyOicAttendanceReceipt,
  verifyStudentQrPayload,
} from './index';

describe('libs/shared-crypto Ed25519 dual-signed QR trust (D-008)', () => {
  const now = Date.UTC(2026, 10, 26, 4, 0, 0);
  const serverKeys = generateEd25519Keypair();
  const studentKeys = generateEd25519Keypair();
  const oicKeys = generateEd25519Keypair();

  const trustKeys: TrustPublicKeyDto[] = [
    {
      kid: 'vits-test-1',
      alg: 'Ed25519',
      publicKey: serverKeys.publicKeyB64,
      status: 'active',
      validFrom: new Date(now - 3600_000).toISOString(),
      validUntil: null,
    },
  ];

  const studentCert = signStudentPassCert(
    {
      id: 'scert-1',
      studentId: 'usr-student-maria',
      studentName: 'Maria Santos',
      universityId: '2024-10482',
      studentDevicePubkey: studentKeys.publicKeyB64,
      validFrom: new Date(now - 600_000).toISOString(),
      validTo: new Date(now + 3600_000).toISOString(),
      kid: 'vits-test-1',
    },
    serverKeys.privateKeyB64,
  );

  const oicCert = signOicDutyCert(
    {
      id: 'ocert-1',
      oicId: 'usr-oic-carlo',
      oicName: 'Carlo Reyes',
      sectionId: 'sec-reserve',
      sectionName: 'Reserve & Thesis Section',
      shiftId: 'shf-1',
      oicDevicePubkey: oicKeys.publicKeyB64,
      validFrom: new Date(now - 600_000).toISOString(),
      validTo: new Date(now + 3600_000).toISOString(),
      kid: 'vits-test-1',
    },
    serverKeys.privateKeyB64,
  );

  it('signs and verifies a valid Student QR + OIC Attendance Receipt offline', () => {
    const qr = signStudentQrPayload(studentCert, studentKeys.privateKeyB64, now, 'nonce-abc123');
    expect(verifyStudentQrPayload(qr, trustKeys, now + 5_000).valid).toBe(true);

    const receipt = signOicAttendanceReceipt(oicCert, qr, 'IN', oicKeys.privateKeyB64, {
      oicTs: now + 5_000,
      oicMonoMs: 120_000,
      bootId: 'boot-1',
    });
    expect(verifyOicAttendanceReceipt(receipt, trustKeys, now + 10_000).valid).toBe(true);
  });

  it('rejects tampered payloads, expired rotations, unknown kid, and self-scans', () => {
    const qr = signStudentQrPayload(studentCert, studentKeys.privateKeyB64, now, 'nonce-tamper');
    const tamperedQr = { ...qr, nonce: 'nonce-evil' };
    expect(verifyStudentQrPayload(tamperedQr, trustKeys, now).code).toBe('QR_INVALID_SIGNATURE');

    const staleResult = verifyStudentQrPayload(qr, trustKeys, now + 120_000);
    expect(staleResult.valid).toBe(false);
    expect(staleResult.code).toBe('QR_EXPIRED_ROTATION');

    const badKidResult = verifyStudentQrPayload(qr, [], now);
    expect(badKidResult.code).toBe('QR_INVALID_SIGNATURE');

    const selfOicCert = signOicDutyCert(
      {
        id: 'ocert-self',
        oicId: 'usr-student-maria',
        oicName: 'Maria Santos',
        sectionId: 'sec-reserve',
        sectionName: 'Reserve',
        shiftId: 'shf-1',
        oicDevicePubkey: oicKeys.publicKeyB64,
        validFrom: new Date(now - 600_000).toISOString(),
        validTo: new Date(now + 3600_000).toISOString(),
        kid: 'vits-test-1',
      },
      serverKeys.privateKeyB64,
    );
    const selfReceipt = signOicAttendanceReceipt(selfOicCert, qr, 'IN', oicKeys.privateKeyB64, {
      oicTs: now + 1_000,
      oicMonoMs: 1000,
      bootId: 'b1',
    });
    expect(verifyOicAttendanceReceipt(selfReceipt, trustKeys, now + 1_000).code).toBe(
      'SELF_ACTION_FORBIDDEN',
    );
  });
});
