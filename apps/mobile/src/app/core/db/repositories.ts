import { computed, inject, Injectable } from '@angular/core';
import type {
  HoursSummaryDto,
  OutboxEntry,
  ShiftDto,
  SyncOpType,
  TaskDto,
  TrustPublicKeyDto,
  UserProfileDto,
} from '@vits/shared-types';
import { SecureVaultService } from '../secure-vault.service';
import { LocalDbService } from './local-db.service';

@Injectable({ providedIn: 'root' })
export class OutboxRepository {
  private readonly db = inject(LocalDbService);
  private readonly vault = inject(SecureVaultService);

  readonly entries = computed(() => this.db.state().outbox);
  readonly pendingCount = computed(
    () => this.db.state().outbox.filter((e) => e.status !== 'done' && !e.permanentFailure).length,
  );
  readonly failedEntries = computed(() =>
    this.db.state().outbox.filter((e) => e.permanentFailure),
  );

  hasPendingForEntity(entityId: string): boolean {
    return this.db
      .state()
      .outbox.some((e) => e.entityId === entityId && e.status !== 'done' && !e.permanentFailure);
  }

  async enqueue(input: {
    entityType: OutboxEntry['entityType'];
    entityId: string;
    type: SyncOpType;
    label: string;
    payload: Record<string, unknown>;
  }): Promise<OutboxEntry> {
    const bootId = await this.vault.getBootId();
    const entry: OutboxEntry = {
      opId: `op-${crypto.randomUUID()}`,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      label: input.label,
      payload: input.payload,
      createdWallTs: new Date().toISOString(),
      createdMonoMs: this.vault.getMonotonicMs(),
      bootId,
      status: 'pending',
      permanentFailure: false,
      attempts: 0,
      lastError: null,
    };
    await this.db.runTransaction((draft) => {
      draft.outbox.push(entry);
    });
    return entry;
  }

  async getRetryableBatch(): Promise<OutboxEntry[]> {
    await this.db.init();
    return this.db
      .state()
      .outbox.filter((e) => !e.permanentFailure && (e.status === 'pending' || e.status === 'failed'));
  }

  async markSending(opIds: string[]): Promise<void> {
    const set = new Set(opIds);
    await this.db.runTransaction((draft) => {
      for (const e of draft.outbox) {
        if (set.has(e.opId)) {
          e.status = 'sending';
          e.attempts += 1;
        }
      }
    });
  }

  async applyPushOutcomes(
    outcomes: Array<{ opId: string; status: 'applied' | 'duplicate' | 'rejected'; reason?: string }>,
  ): Promise<void> {
    const map = new Map(outcomes.map((o) => [o.opId, o]));
    await this.db.runTransaction((draft) => {
      for (const e of draft.outbox) {
        const res = map.get(e.opId);
        if (!res) continue;
        if (res.status === 'applied' || res.status === 'duplicate') {
          e.status = 'done';
          e.lastError = null;
        } else {
          e.status = 'failed';
          e.permanentFailure = true;
          e.lastError = res.reason ?? 'Rejected by server.';
        }
      }
    });
  }

  async markBatchTransportFailed(opIds: string[], errorMessage: string): Promise<void> {
    const set = new Set(opIds);
    await this.db.runTransaction((draft) => {
      for (const e of draft.outbox) {
        if (set.has(e.opId)) {
          e.status = 'failed';
          e.lastError = errorMessage;
        }
      }
    });
  }

  async dismissFailedOp(opId: string): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.outbox = draft.outbox.filter((e) => e.opId !== opId);
    });
  }
}

@Injectable({ providedIn: 'root' })
export class ShiftsRepository {
  private readonly db = inject(LocalDbService);
  private readonly outbox = inject(OutboxRepository);

  readonly shifts = computed(() =>
    this.db.state().cachedShifts.map((s) => ({
      ...s,
      pendingSync: this.outbox.hasPendingForEntity(s.id),
    })),
  );
  readonly hoursSummary = computed(() => this.db.state().cachedHoursSummary);

  getById(id: string): (ShiftDto & { pendingSync: boolean }) | undefined {
    return this.shifts().find((s) => s.id === id);
  }

  async replaceShifts(shifts: ShiftDto[]): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.cachedShifts = shifts;
    });
  }

  async setHoursSummary(summary: HoursSummaryDto): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.cachedHoursSummary = summary;
    });
  }

  async applyLocalAttendance(
    studentId: string,
    sectionId: string,
    action: 'IN' | 'OUT',
    isoTime: string,
  ): Promise<string | null> {
    let targetShiftId: string | null = null;
    await this.db.runTransaction((draft) => {
      const shift =
        draft.cachedShifts.find((s) => s.userId === studentId && s.sectionId === sectionId && s.status !== 'completed') ??
        draft.cachedShifts.find((s) => s.userId === studentId);
      if (!shift) return;
      targetShiftId = shift.id;
      shift.status = action === 'IN' ? 'in_progress' : 'completed';
      shift.attendance = {
        ...shift.attendance,
        checkInAt: action === 'IN' ? shift.attendance.checkInAt ?? isoTime : shift.attendance.checkInAt,
        checkOutAt: action === 'OUT' ? isoTime : shift.attendance.checkOutAt,
        verificationStatus: 'pending_sync',
      };
      shift.version += 1;
    });
    return targetShiftId;
  }

  async applyLocalSignoff(shiftId: string, oicName: string, remarks?: string): Promise<void> {
    await this.db.runTransaction((draft) => {
      const shift = draft.cachedShifts.find((s) => s.id === shiftId);
      if (!shift) return;
      shift.status = 'completed';
      shift.signedOffBy = oicName;
      shift.signedOffAt = new Date().toISOString();
      shift.signoffRemarks = remarks ?? null;
      shift.version += 1;
    });
  }
}

@Injectable({ providedIn: 'root' })
export class TasksRepository {
  private readonly db = inject(LocalDbService);
  private readonly outbox = inject(OutboxRepository);

  readonly tasks = computed(() =>
    this.db.state().cachedTasks.map((t) => ({
      ...t,
      pendingSync: this.outbox.hasPendingForEntity(t.id),
    })),
  );

  async replaceTasks(tasks: TaskDto[]): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.cachedTasks = tasks;
    });
  }

  async upsertLocalTask(task: TaskDto): Promise<void> {
    await this.db.runTransaction((draft) => {
      const idx = draft.cachedTasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) draft.cachedTasks[idx] = task;
      else draft.cachedTasks.unshift(task);
    });
  }

  async updateLocalTaskStatus(taskId: string, status: TaskDto['status']): Promise<void> {
    await this.db.runTransaction((draft) => {
      const task = draft.cachedTasks.find((t) => t.id === taskId);
      if (!task) return;
      task.status = status;
      task.completedAt = status === 'done' || status === 'verified' ? new Date().toISOString() : null;
      task.version += 1;
    });
  }
}

@Injectable({ providedIn: 'root' })
export class TrustCacheRepository {
  private readonly db = inject(LocalDbService);

  async getKeys(): Promise<TrustPublicKeyDto[]> {
    await this.db.init();
    return this.db.state().trustKeys;
  }

  async setKeys(keys: TrustPublicKeyDto[]): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.trustKeys = keys;
    });
  }

  async setProfile(profile: UserProfileDto | null): Promise<void> {
    await this.db.runTransaction((draft) => {
      draft.cachedProfile = profile;
    });
  }
}
