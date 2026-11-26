import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  generateEd25519Keypair,
  signOicAttendanceReceipt,
  signStudentQrPayload,
} from '@vits/shared-crypto';
import type {
  AuthTokensResponseDto,
  DutyCertificateDto,
  StudentPassCertificateDto,
  SyncPullResponseDto,
  SyncPushResponseDto,
} from '@vits/shared-types';
import { AppModule } from './app.module';
import { configureVitsApp } from './main';
import { DEMO_API_PASSWORD, InMemoryApiStore } from './repositories/in-memory.store';

describe('VITS API E2E (Phases 3–5: Identity, Trust, Sync, Roster & Tasks)', () => {
  let app: INestApplication;
  let store: InMemoryApiStore;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    app = await NestFactory.create(AppModule, { logger: false });
    await configureVitsApp(app, false);
    await app.init();

    store = app.get(InMemoryApiStore);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health responds unauthenticated', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects wrong password, admin on mobile client, expired JWT, and student on OIC routes', async () => {
    // Wrong password
    const badPw = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'student@university.edu', password: 'WrongPassword!' })
      .expect(401);
    expect(badPw.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    // Admin rejected on mobile client id
    const adminMobile = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'admin@university.edu', password: DEMO_API_PASSWORD })
      .expect(403);
    expect(adminMobile.body.error.code).toBe('AUTH_FORBIDDEN_CLIENT');

    // Student login succeeds on mobile
    const stuLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'student@university.edu', password: DEMO_API_PASSWORD })
      .expect(200);
    const stuTokens = stuLogin.body as AuthTokensResponseDto;
    expect(stuTokens.user.role).toBe('student');

    // Student calling OIC route gets 403
    const oicRosterRes = await request(app.getHttpServer())
      .get('/v1/oic/section-roster')
      .set('Authorization', `Bearer ${stuTokens.accessToken}`)
      .expect(403);
    expect(oicRosterRes.body.error.code).toBe('AUTH_INSUFFICIENT_ROLE');

    // Expired access token gets 401
    const expiredJwt = await jwtService.signAsync(
      { sub: stuTokens.user.id, role: 'student', sid: 'expired-sid', clientId: 'mobile' },
      { secret: store.config.jwtAccessSecret, expiresIn: -10 },
    );
    const expRes = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${expiredJwt}`)
      .expect(401);
    expect(expRes.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('rotates refresh token cleanly and revokes entire session family on reuse', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'student@university.edu', password: DEMO_API_PASSWORD })
      .expect(200);
    const initial = loginRes.body as AuthTokensResponseDto;

    // First refresh succeeds and issues new pair
    const rotatedRes = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(200);
    const rotated = rotatedRes.body as AuthTokensResponseDto;
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);

    // Presenting old refresh token again triggers family-wide revocation
    const reuseRes = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(401);
    expect(reuseRes.body.error.code).toBe('AUTH_REFRESH_REUSED');

    // Even the newer token in the same family is now revoked
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('executes trust certs, offline dual-signed QR sync push idempotency, discrepancy logging, pull, roster & tasks', async () => {
    // 1. Login Student and OIC
    const stuLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'student@university.edu', password: DEMO_API_PASSWORD })
      .expect(200);
    const stuAuth = stuLogin.body as AuthTokensResponseDto;

    const oicLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'mobile')
      .send({ email: 'oic@university.edu', password: DEMO_API_PASSWORD })
      .expect(200);
    const oicAuth = oicLogin.body as AuthTokensResponseDto;

    // 2. Issue Student Pass Cert & OIC Duty Cert
    const studentKeys = generateEd25519Keypair();
    const oicKeys = generateEd25519Keypair();

    const passRes = await request(app.getHttpServer())
      .post('/v1/student/pass-certificates')
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .send({ deviceId: 'stu-dev-1', studentDevicePubkey: studentKeys.publicKeyB64 })
      .expect(201);
    const studentCert = passRes.body as StudentPassCertificateDto;

    const dutyRes = await request(app.getHttpServer())
      .post('/v1/oic/duty-certificates')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send({
        shiftId: 'shf-today-maria',
        sectionId: 'sec-reserve',
        deviceId: 'oic-dev-1',
        oicDevicePubkey: oicKeys.publicKeyB64,
      })
      .expect(201);
    const oicCert = dutyRes.body as DutyCertificateDto;

    // 3. Generate valid Student QR & OIC co-signed receipt
    const now = Date.now();
    const validQr = signStudentQrPayload(studentCert, studentKeys.privateKeyB64, now, 'nonce-e2e-1');
    const validReceipt = signOicAttendanceReceipt(oicCert, validQr, 'IN', oicKeys.privateKeyB64, {
      oicTs: now,
      oicMonoMs: 50_000,
      bootId: 'boot-oic-1',
    });

    const pushBody = {
      batchId: 'batch-e2e-1',
      deviceId: 'oic-dev-1',
      clientSentWallTs: new Date(now).toISOString(),
      clientSentMonoMs: 50_500,
      bootId: 'boot-oic-1',
      ops: [
        {
          opId: 'op-att-1',
          type: 'attendance.scan',
          entityId: 'shf-today-maria',
          payload: { receipt: validReceipt },
          createdWallTs: new Date(now).toISOString(),
          createdMonoMs: 50_000,
          bootId: 'boot-oic-1',
        },
      ],
    };

    const push1 = await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send(pushBody)
      .expect(200);
    expect((push1.body as SyncPushResponseDto).results[0].status).toBe('applied');

    // Replaying the exact same push is idempotent (duplicate -> no-op)
    const push2 = await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send(pushBody)
      .expect(200);
    expect((push2.body as SyncPushResponseDto).results[0].status).toBe('duplicate');

    // 4. Tampered QR signature creates a discrepancy and rejects the op
    const initialDiscCount = store.discrepancies.length;
    const tamperedReceipt = {
      ...validReceipt,
      studentQr: { ...validQr, nonce: 'tampered-nonce' },
    };
    const tamperRes = await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send({
        ...pushBody,
        batchId: 'batch-e2e-tamper',
        ops: [
          {
            ...pushBody.ops[0],
            opId: 'op-att-tamper',
            payload: { receipt: tamperedReceipt },
          },
        ],
      })
      .expect(200);
    expect((tamperRes.body as SyncPushResponseDto).results[0].status).toBe('rejected');
    expect(store.discrepancies.length).toBe(initialDiscCount + 1);

    // 5. Clock-drift tampered (+20 min) scan produces a clock_drift discrepancy
    const driftTs = now + 20 * 60_000;
    const driftQr = signStudentQrPayload(studentCert, studentKeys.privateKeyB64, driftTs, 'nonce-drift-1');
    const driftReceipt = signOicAttendanceReceipt(
      oicCert,
      driftQr,
      'IN',
      oicKeys.privateKeyB64,
      { oicTs: driftTs, oicMonoMs: 60_000, bootId: 'boot-oic-1' },
    );
    await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send({
        ...pushBody,
        batchId: 'batch-e2e-drift',
        ops: [
          {
            opId: 'op-att-drift',
            type: 'attendance.scan',
            entityId: 'shf-today-maria',
            payload: { receipt: driftReceipt },
            createdWallTs: new Date(driftTs).toISOString(),
            createdMonoMs: 60_000,
            bootId: 'boot-oic-1',
          },
        ],
      })
      .expect(200);
    expect(store.discrepancies[0].type).toBe('clock_drift');

    // 6. Sync pull returns updated shift state
    const pullRes = await request(app.getHttpServer())
      .get('/v1/sync/pull?cursor=0')
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .expect(200);
    const pullBody = pullRes.body as SyncPullResponseDto;
    expect(pullBody.changes.length).toBeGreaterThan(0);
    expect(pullBody.nextCursor).toBeGreaterThan(0);

    // 7. Phase 5: Roster, Tasks & OIC Signoff
    const shiftsRes = await request(app.getHttpServer())
      .get('/v1/me/shifts')
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .expect(200);
    expect(shiftsRes.body.shifts.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get('/v1/me/hours-summary')
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .expect(200);

    const createdTaskRes = await request(app.getHttpServer())
      .post('/v1/tasks')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send({
        shiftId: 'shf-today-maria',
        category: 'shelving',
        assignedToUserId: stuAuth.user.id,
        title: 'Reshelve reserve returns',
      })
      .expect(201);
    const taskId = createdTaskRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .send({ status: 'done' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/shifts/shf-today-maria/signoff')
      .set('Authorization', `Bearer ${oicAuth.accessToken}`)
      .send({ remarks: 'Great work on reserve desk.' })
      .expect(200);

    // 8. Admin Web connected live to same API store (sees mobile sync batches & discrepancies)
    const adminLoginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Client-Id', 'admin')
      .send({ email: 'admin@university.edu', password: DEMO_API_PASSWORD })
      .expect(200);
    const adminAuth = adminLoginRes.body as AuthTokensResponseDto;

    // Non-admin JWT cannot access /v1/admin/*
    await request(app.getHttpServer())
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${stuAuth.accessToken}`)
      .expect(403);

    const batchesRes = await request(app.getHttpServer())
      .get('/v1/admin/sync-batches')
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(batchesRes.body.batches.length).toBeGreaterThan(0);

    const discRes = await request(app.getHttpServer())
      .get('/v1/admin/discrepancies')
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(discRes.body.discrepancies.length).toBeGreaterThan(0);

    const firstDiscId = discRes.body.discrepancies[0].id as string;
    const resolvedRes = await request(app.getHttpServer())
      .patch(`/v1/admin/discrepancies/${firstDiscId}/resolve`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({ resolutionNotes: 'Verified with OIC duty log.' })
      .expect(200);
    expect(resolvedRes.body.status).toBe('resolved');

    const reportRes = await request(app.getHttpServer())
      .get('/v1/admin/reports/compliance')
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(reportRes.body.totalStudents).toBeGreaterThanOrEqual(2);
  });
});
