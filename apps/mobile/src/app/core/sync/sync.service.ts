import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient, ConnectivityService } from '@vits/shared-network';
import type {
  HoursSummaryDto,
  ShiftDto,
  SyncPullChangeDto,
  SyncPullResponseDto,
  SyncPushRequestDto,
  SyncPushResponseDto,
  TaskDto,
  UserProfileDto,
} from '@vits/shared-types';
import { SecureVaultService } from '../secure-vault.service';
import { LocalDbService } from '../db/local-db.service';
import { OutboxRepository } from '../db/repositories';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiClient);
  private readonly connectivity = inject(ConnectivityService);
  private readonly db = inject(LocalDbService);
  private readonly outbox = inject(OutboxRepository);
  private readonly vault = inject(SecureVaultService);
  private readonly destroyRef = inject(DestroyRef);

  readonly syncing = signal(false);
  readonly lastSyncError = signal<string | null>(null);
  readonly pendingCount = this.outbox.pendingCount;
  readonly failedOps = this.outbox.failedEntries;

  private activeSync: Promise<void> | null = null;
  private retryAttempt = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private listenersAttached = false;

  constructor() {
    effect(() => {
      const online = this.connectivity.isOnline();
      if (online && this.listenersAttached && this.outbox.pendingCount() > 0) {
        this.scheduleDebouncedSync(250);
      }
    });
  }

  attachLifecycleTriggers(hasSession: () => boolean): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    if (Capacitor.isNativePlatform()) {
      const handlePromise = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && hasSession() && this.connectivity.isOnline()) {
          void this.syncNow();
        }
      });
      this.destroyRef.onDestroy(() => {
        void handlePromise.then((h) => h.remove());
      });
    }

    this.destroyRef.onDestroy(() => {
      if (this.retryTimer) clearTimeout(this.retryTimer);
    });
  }

  scheduleDebouncedSync(delayMs = 400): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.connectivity.isOnline()) {
        void this.syncNow();
      }
    }, delayMs);
  }

  async syncNow(): Promise<void> {
    if (!this.connectivity.isOnline()) return;
    if (this.activeSync) return this.activeSync;

    this.activeSync = this.executeCycle().finally(() => {
      this.activeSync = null;
    });
    return this.activeSync;
  }

  private async executeCycle(): Promise<void> {
    await this.db.init();
    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      await this.pushOutbox();
      await this.pullDeltaPages();
      this.retryAttempt = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed; will retry automatically.';
      this.lastSyncError.set(msg);
      this.scheduleBackoffRetry();
      throw err;
    } finally {
      this.syncing.set(false);
    }
  }

  private async pushOutbox(): Promise<void> {
    const batch = await this.outbox.getRetryableBatch();
    if (batch.length === 0) return;

    const opIds = batch.map((b) => b.opId);
    const deviceId = await this.vault.getOrCreateDeviceId();
    const bootId = await this.vault.getBootId();

    await this.outbox.markSending(opIds);

    const requestBody: SyncPushRequestDto = {
      batchId: `bat-${crypto.randomUUID()}`,
      deviceId,
      clientSentWallTs: new Date().toISOString(),
      clientSentMonoMs: this.vault.getMonotonicMs(),
      bootId,
      ops: batch.map((b) => ({
        opId: b.opId,
        type: b.type,
        entityId: b.entityId,
        payload: b.payload,
        createdWallTs: b.createdWallTs,
        createdMonoMs: b.createdMonoMs,
        bootId: b.bootId,
      })),
    };

    try {
      const res = await firstValueFrom(
        this.api.post<SyncPushRequestDto, SyncPushResponseDto>('/sync/push', requestBody, {
          endpointGroup: 'identity',
        }),
      );
      await this.outbox.applyPushOutcomes(res.results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network failure during sync push.';
      await this.outbox.markBatchTransportFailed(opIds, msg);
      throw err;
    }
  }

  private async pullDeltaPages(): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const cursor = this.db.state().syncState.cursor;
      const page = await firstValueFrom(
        this.api.get<SyncPullResponseDto>('/sync/pull', {
          endpointGroup: 'roster',
          params: { cursor, limit: 100 },
        }),
      );

      await this.applyPullTransaction(page);
      hasMore = page.hasMore;
    }
  }

  async applyPullTransaction(page: SyncPullResponseDto): Promise<void> {
    await this.db.runTransaction((draft) => {
      for (const change of page.changes) {
        this.applyChangeToDraft(draft, change);
      }
      draft.syncState.cursor = Math.max(draft.syncState.cursor, page.nextCursor);
      draft.syncState.lastSyncAt = page.serverTime;
      const parsedServer = Date.parse(page.serverTime);
      if (Number.isFinite(parsedServer)) {
        draft.syncState.clockOffsetMs = parsedServer - Date.now();
      }
    });
  }

  private applyChangeToDraft(
    draft: ReturnType<LocalDbService['state']>,
    change: SyncPullChangeDto,
  ): void {
    if (change.table === 'shifts') {
      const shift = change.data as unknown as ShiftDto;
      if (change.op === 'delete') {
        draft.cachedShifts = draft.cachedShifts.filter((s) => s.id !== change.id);
        return;
      }
      const idx = draft.cachedShifts.findIndex((s) => s.id === change.id);
      if (idx >= 0) {
        if (shift.version >= draft.cachedShifts[idx].version) {
          draft.cachedShifts[idx] = shift;
        }
      } else {
        draft.cachedShifts.push(shift);
      }
      return;
    }

    if (change.table === 'tasks') {
      const task = change.data as unknown as TaskDto;
      if (change.op === 'delete') {
        draft.cachedTasks = draft.cachedTasks.filter((t) => t.id !== change.id);
        return;
      }
      const idx = draft.cachedTasks.findIndex((t) => t.id === change.id);
      if (idx >= 0) {
        if (task.version >= draft.cachedTasks[idx].version) {
          draft.cachedTasks[idx] = task;
        }
      } else {
        draft.cachedTasks.unshift(task);
      }
      return;
    }

    if (change.table === 'hours_summary') {
      draft.cachedHoursSummary = change.data as unknown as HoursSummaryDto;
      return;
    }

    if (change.table === 'profile') {
      draft.cachedProfile = change.data as unknown as UserProfileDto;
    }
  }

  private scheduleBackoffRetry(): void {
    if (this.retryAttempt >= 5) return;
    this.retryAttempt += 1;
    const capMs = Math.min(15_000, 500 * Math.pow(2, this.retryAttempt - 1));
    const jitter = Math.floor(Math.random() * capMs * 0.5);
    this.scheduleDebouncedSync(capMs + jitter);
  }
}
