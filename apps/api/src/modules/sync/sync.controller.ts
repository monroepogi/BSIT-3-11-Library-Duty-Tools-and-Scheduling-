import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { verifyOicAttendanceReceipt } from '@vits/shared-crypto';
import {
  getLibraryDateString,
  type OicAttendanceReceiptDto,
  type SyncOpResultDto,
  type SyncOpType,
  type SyncPullResponseDto,
  type SyncPushOpDto,
  type SyncPushRequestDto,
  type SyncPushResponseDto,
  type TaskDto,
  type UserProfileDto,
} from '@vits/shared-types';
import { IsArray, IsNumber, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, JwtAuthGuard } from '../../common/auth.guards';
import { InMemoryApiStore } from '../../repositories/in-memory.store';

export class PushOpInputDto implements SyncPushOpDto {
  @IsString()
  opId!: string;

  @IsString()
  type!: SyncOpType;

  @IsString()
  entityId!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  createdWallTs!: string;

  @IsNumber()
  createdMonoMs!: number;

  @IsString()
  bootId!: string;
}

export class SyncPushBodyDto implements SyncPushRequestDto {
  @IsString()
  batchId!: string;

  @IsString()
  deviceId!: string;

  @IsString()
  clientSentWallTs!: string;

  @IsNumber()
  clientSentMonoMs!: number;

  @IsString()
  bootId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushOpInputDto)
  ops!: PushOpInputDto[];
}

const MAX_CLOCK_DRIFT_MS = 5 * 60_000;

@Injectable()
export class SyncEngineService {
  constructor(@Inject(InMemoryApiStore) private readonly store: InMemoryApiStore) {}

  push(dto: SyncPushBodyDto, user: UserProfileDto): SyncPushResponseDto {
    const serverNowMs = Date.now();
    const serverTime = new Date(serverNowMs).toISOString();
    const results: SyncOpResultDto[] = [];

    for (const op of dto.ops) {
      if (this.store.processedOpIds.has(op.opId)) {
        results.push({ opId: op.opId, status: 'duplicate' });
        continue;
      }

      const outcome = this.applyOp(op, dto, user, serverNowMs);
      if (outcome.status === 'applied') {
        this.store.processedOpIds.add(op.opId);
      }
      results.push(outcome);
    }

    this.store.syncBatches.unshift({
      id: dto.batchId,
      deviceId: dto.deviceId,
      userId: user.id,
      receivedAt: serverTime,
      appliedCount: results.filter((r) => r.status === 'applied').length,
      duplicateCount: results.filter((r) => r.status === 'duplicate').length,
      rejectedCount: results.filter((r) => r.status === 'rejected').length,
      ops: dto.ops.map((op, idx) => ({
        opId: op.opId,
        type: op.type,
        status: results[idx]?.status ?? 'rejected',
        reason: results[idx]?.reason ?? null,
      })),
    });

    return {
      batchId: dto.batchId,
      serverTime,
      results,
    };
  }

  pull(user: UserProfileDto, cursorRaw?: string, limitRaw?: string): SyncPullResponseDto {
    const cursor = Math.max(0, Number(cursorRaw ?? 0) || 0);
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 100) || 100));
    const { changes, nextCursor, hasMore } = this.store.pullChangesForUser(user, cursor, limit);
    return {
      changes,
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    };
  }

  private applyOp(
    op: PushOpInputDto,
    batch: SyncPushBodyDto,
    user: UserProfileDto,
    serverNowMs: number,
  ): SyncOpResultDto {
    if (op.type === 'attendance.scan') {
      return this.applyAttendanceScan(op, batch, user, serverNowMs);
    }

    if (op.type === 'task.create') {
      if (user.role !== 'oic') {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'AUTH_INSUFFICIENT_ROLE',
          reason: 'Only OICs may create tasks.',
        };
      }
      const p = op.payload as {
        id?: string;
        shiftId: string;
        category: TaskDto['category'];
        assignedToUserId?: string | null;
        title: string;
        description?: string | null;
      };
      const shift = this.store.shifts.find((s) => s.id === p.shiftId);
      const assignee = p.assignedToUserId ? this.store.findUserById(p.assignedToUserId)?.profile : undefined;
      const sectionId = shift?.sectionId ?? user.sectionIds[0] ?? 'sec-reserve';
      const task: TaskDto = {
        id: p.id ?? op.entityId,
        shiftId: p.shiftId,
        sectionId,
        sectionName: this.store.getSectionName(sectionId),
        category: p.category,
        assignedToUserId: assignee?.id ?? shift?.userId ?? null,
        assignedToName: assignee?.fullName ?? shift?.userFullName ?? null,
        createdByUserId: user.id,
        createdByName: user.fullName,
        title: p.title,
        description: p.description ?? null,
        status: 'todo',
        completedAt: null,
        version: 1,
      };
      this.store.tasks.unshift(task);
      this.store.recordChange(
        'tasks',
        task.id,
        'upsert',
        task as unknown as Record<string, unknown>,
        task.version,
        task.assignedToUserId ? [task.assignedToUserId] : null,
        [task.sectionId],
      );
      return { opId: op.opId, status: 'applied' };
    }

    if (op.type === 'task.update_status') {
      const p = op.payload as { status: TaskDto['status'] };
      const task = this.store.tasks.find((t) => t.id === op.entityId);
      if (!task) {
        return { opId: op.opId, status: 'rejected', code: 'RESOURCE_NOT_FOUND', reason: 'Task not found.' };
      }
      if (p.status === 'verified' && user.role !== 'oic') {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'AUTH_INSUFFICIENT_ROLE',
          reason: 'Only OICs can verify tasks.',
        };
      }
      task.status = p.status;
      task.completedAt = p.status === 'done' || p.status === 'verified' ? new Date(serverNowMs).toISOString() : null;
      task.version += 1;
      this.store.recordChange(
        'tasks',
        task.id,
        'upsert',
        task as unknown as Record<string, unknown>,
        task.version,
        task.assignedToUserId ? [task.assignedToUserId] : null,
        [task.sectionId],
      );
      return { opId: op.opId, status: 'applied' };
    }

    if (op.type === 'shift.signoff') {
      if (user.role !== 'oic') {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'AUTH_INSUFFICIENT_ROLE',
          reason: 'Only OICs can sign off shifts.',
        };
      }
      const shift = this.store.shifts.find((s) => s.id === op.entityId);
      if (!shift) {
        return { opId: op.opId, status: 'rejected', code: 'RESOURCE_NOT_FOUND', reason: 'Shift not found.' };
      }
      if (shift.signedOffAt) {
        return {
          opId: op.opId,
          status: 'rejected',
          code: 'SHIFT_ALREADY_SIGNED_OFF',
          reason: 'Shift was already signed off.',
        };
      }
      shift.status = 'completed';
      shift.signedOffBy = user.fullName;
      shift.signedOffAt = new Date(serverNowMs).toISOString();
      shift.signoffRemarks = (op.payload['remarks'] as string | undefined) ?? null;
      shift.version += 1;
      this.store.recordChange(
        'shifts',
        shift.id,
        'upsert',
        shift as unknown as Record<string, unknown>,
        shift.version,
        [shift.userId],
        [shift.sectionId],
      );
      return { opId: op.opId, status: 'applied' };
    }

    return { opId: op.opId, status: 'rejected', code: 'VALIDATION_ERROR', reason: `Unsupported op type ${op.type}` };
  }

  private applyAttendanceScan(
    op: PushOpInputDto,
    batch: SyncPushBodyDto,
    caller: UserProfileDto,
    serverNowMs: number,
  ): SyncOpResultDto {
    if (caller.role !== 'oic') {
      return {
        opId: op.opId,
        status: 'rejected',
        code: 'AUTH_INSUFFICIENT_ROLE',
        reason: 'Only OIC devices can submit scanned attendance receipts.',
      };
    }

    const receipt = op.payload['receipt'] as OicAttendanceReceiptDto | undefined;
    if (!receipt) {
      return {
        opId: op.opId,
        status: 'rejected',
        code: 'VALIDATION_ERROR',
        reason: 'Attendance receipt payload is required.',
      };
    }

    // 1. Cryptographic dual-signature verification
    const verifyRes = verifyOicAttendanceReceipt(receipt, this.store.trustKeys, receipt.oicTs || serverNowMs, 120_000);
    if (!verifyRes.valid) {
      this.store.discrepancies.unshift({
        id: `dsc-${randomUUID()}`,
        type: verifyRes.code === 'SELF_ACTION_FORBIDDEN' ? 'self_action' : 'invalid_signature',
        severity: 'high',
        userId: receipt.studentQr?.cert?.studentId ?? caller.id,
        shiftId: receipt.oicCert?.shiftId ?? null,
        summary: verifyRes.reason ?? 'Attendance QR signature verification failed.',
        occurredAt: new Date(serverNowMs).toISOString(),
      });
      return {
        opId: op.opId,
        status: 'rejected',
        code: verifyRes.code ?? 'QR_INVALID_SIGNATURE',
        reason: verifyRes.reason ?? 'Invalid QR signature.',
      };
    }

    const studentId = receipt.studentQr.cert.studentId;
    const qrNonce = receipt.studentQr.nonce;

    // 2. Deduplicate on (student_id, qr_nonce)
    if (this.store.hasDuplicateQrNonce(studentId, qrNonce)) {
      return { opId: op.opId, status: 'duplicate' };
    }

    // 3. Monotonic & wall-clock drift tampering check
    const claimWallMs = receipt.oicTs;
    const wallDriftMs = Math.abs(serverNowMs - claimWallMs);
    const prevTrack = this.store.monoTracker.get(batch.deviceId);
    const monoNegative =
      prevTrack !== undefined &&
      prevTrack.bootId === op.bootId &&
      op.createdMonoMs < prevTrack.lastMonoMs;

    if (wallDriftMs > MAX_CLOCK_DRIFT_MS || monoNegative) {
      this.store.discrepancies.unshift({
        id: `dsc-${randomUUID()}`,
        type: 'clock_drift',
        severity: 'high',
        userId: studentId,
        shiftId: receipt.oicCert.shiftId,
        summary: `Device clock anomaly on scan (${Math.round(wallDriftMs / 60_000)}m drift, monoNegative=${monoNegative}).`,
        occurredAt: new Date(serverNowMs).toISOString(),
      });
    }
    this.store.monoTracker.set(batch.deviceId, {
      bootId: op.bootId,
      lastWallMs: claimWallMs,
      lastMonoMs: op.createdMonoMs,
    });

    // 4. Roster membership check
    const scanDate = getLibraryDateString(new Date(claimWallMs), this.store.config.libraryTimezone);
    const shift =
      this.store.shifts.find((s) => s.id === receipt.oicCert.shiftId && s.userId === studentId) ??
      this.store.shifts.find(
        (s) => s.userId === studentId && s.sectionId === receipt.oicCert.sectionId && s.shiftDate === scanDate,
      );

    if (!shift) {
      this.store.discrepancies.unshift({
        id: `dsc-${randomUUID()}`,
        type: 'unrostered_scan',
        severity: 'medium',
        userId: studentId,
        shiftId: null,
        summary: `Student ${receipt.studentQr.cert.studentName} scanned in section ${receipt.oicCert.sectionName} with no rostered shift on ${scanDate}.`,
        occurredAt: new Date(serverNowMs).toISOString(),
      });
      return {
        opId: op.opId,
        status: 'rejected',
        code: 'SHIFT_NOT_ROSTERED',
        reason: 'Student is not rostered for a shift in this section today.',
      };
    }

    const eventIso = new Date(claimWallMs).toISOString();
    this.store.attendance.push({
      id: `att-${randomUUID()}`,
      studentId,
      oicId: receipt.oicCert.oicId,
      shiftId: shift.id,
      sectionId: shift.sectionId,
      qrNonce,
      action: receipt.action,
      oicTs: eventIso,
      serverReceivedAt: new Date(serverNowMs).toISOString(),
    });

    const prevAtt = shift.attendance ?? {
      checkInAt: null,
      checkOutAt: null,
      verificationStatus: 'none' as const,
    };

    if (receipt.action === 'IN') {
      shift.status = 'in_progress';
      shift.attendance = {
        ...prevAtt,
        checkInAt: prevAtt.checkInAt ?? eventIso,
        verificationStatus: wallDriftMs > MAX_CLOCK_DRIFT_MS ? 'flagged' : 'verified',
      };
    } else {
      shift.status = 'completed';
      shift.attendance = {
        ...prevAtt,
        checkOutAt: eventIso,
        verificationStatus: wallDriftMs > MAX_CLOCK_DRIFT_MS ? 'flagged' : 'verified',
      };
    }
    shift.version += 1;

    this.store.recordChange(
      'shifts',
      shift.id,
      'upsert',
      shift as unknown as Record<string, unknown>,
      shift.version,
      [shift.userId],
      [shift.sectionId],
    );

    return { opId: op.opId, status: 'applied' };
  }
}

@ApiTags('sync')
@Controller('sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(@Inject(SyncEngineService) private readonly syncService: SyncEngineService) {}

  @Post('push')
  @HttpCode(200)
  push(
    @CurrentUser() user: UserProfileDto,
    @Body() dto: SyncPushBodyDto,
  ): SyncPushResponseDto {
    return this.syncService.push(dto, user);
  }

  @Get('pull')
  pull(
    @CurrentUser() user: UserProfileDto,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): SyncPullResponseDto {
    return this.syncService.pull(user, cursor, limit);
  }
}
