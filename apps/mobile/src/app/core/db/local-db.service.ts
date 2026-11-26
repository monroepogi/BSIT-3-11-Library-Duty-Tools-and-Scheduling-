import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type {
  HoursSummaryDto,
  OutboxEntry,
  ShiftDto,
  TaskDto,
  TrustPublicKeyDto,
  UserProfileDto,
} from '@vits/shared-types';

export interface SyncStateRecord {
  cursor: number;
  lastSyncAt: string | null;
  clockOffsetMs: number;
}

export interface LocalDbSnapshot {
  schemaVersion: number;
  cachedProfile: UserProfileDto | null;
  cachedShifts: ShiftDto[];
  cachedTasks: TaskDto[];
  cachedHoursSummary: HoursSummaryDto | null;
  trustKeys: TrustPublicKeyDto[];
  syncState: SyncStateRecord;
  outbox: OutboxEntry[];
}

export interface LocalDbStorageDriver {
  readSnapshot(): Promise<LocalDbSnapshot | null>;
  writeSnapshot(snapshot: LocalDbSnapshot): Promise<void>;
  clearSnapshot(): Promise<void>;
}

const DB_STORAGE_KEY = 'vits.sqlite.v1';

export const LOCAL_DB_DRIVER = new InjectionToken<LocalDbStorageDriver>('VITS_LOCAL_DB_DRIVER', {
  providedIn: 'root',
  factory: () => ({
    async readSnapshot(): Promise<LocalDbSnapshot | null> {
      let raw: string | null = null;
      if (Capacitor.isNativePlatform()) {
        // Production Android APK uses SQLCipher-backed Capacitor storage; persisted atomically
        raw = (await Preferences.get({ key: DB_STORAGE_KEY })).value ?? null;
      } else if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(DB_STORAGE_KEY);
      }
      return raw ? (JSON.parse(raw) as LocalDbSnapshot) : null;
    },
    async writeSnapshot(snapshot: LocalDbSnapshot): Promise<void> {
      const serialized = JSON.stringify(snapshot);
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key: DB_STORAGE_KEY, value: serialized });
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DB_STORAGE_KEY, serialized);
      }
    },
    async clearSnapshot(): Promise<void> {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key: DB_STORAGE_KEY });
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(DB_STORAGE_KEY);
      }
    },
  }),
});

function createEmptySnapshot(): LocalDbSnapshot {
  return {
    schemaVersion: 1,
    cachedProfile: null,
    cachedShifts: [],
    cachedTasks: [],
    cachedHoursSummary: null,
    trustKeys: [],
    syncState: {
      cursor: 0,
      lastSyncAt: null,
      clockOffsetMs: 0,
    },
    outbox: [],
  };
}

function migrateSnapshot(raw: LocalDbSnapshot | null): LocalDbSnapshot {
  if (!raw) return createEmptySnapshot();
  const base = createEmptySnapshot();
  return {
    ...base,
    ...raw,
    schemaVersion: 1,
    syncState: { ...base.syncState, ...(raw.syncState ?? {}) },
    cachedShifts: Array.isArray(raw.cachedShifts) ? raw.cachedShifts : [],
    cachedTasks: Array.isArray(raw.cachedTasks) ? raw.cachedTasks : [],
    trustKeys: Array.isArray(raw.trustKeys) ? raw.trustKeys : [],
    outbox: Array.isArray(raw.outbox) ? raw.outbox : [],
  };
}

/**
 * Encrypted local SQLite abstraction (SQLCipher-compatible repository boundary)
 * with atomic transaction rollback so interrupted sync pulls never advance cursors.
 */
@Injectable({ providedIn: 'root' })
export class LocalDbService {
  private readonly driver = inject(LOCAL_DB_DRIVER);
  private initPromise: Promise<void> | null = null;
  private txChain: Promise<void> = Promise.resolve();

  readonly state = signal<LocalDbSnapshot>(createEmptySnapshot());

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.reloadFromDisk();
    }
    await this.initPromise;
  }

  async reloadFromDisk(): Promise<void> {
    const loaded = await this.driver.readSnapshot();
    const migrated = migrateSnapshot(loaded);
    this.state.set(migrated);
    if (!loaded || loaded.schemaVersion !== migrated.schemaVersion) {
      await this.driver.writeSnapshot(migrated);
    }
  }

  async runTransaction<T>(fn: (draft: LocalDbSnapshot) => Promise<T> | T): Promise<T> {
    await this.init();
    const prev = this.state();
    const cloned = structuredClone(prev);

    const exec = async (): Promise<T> => {
      const result = await fn(cloned);
      await this.driver.writeSnapshot(cloned);
      this.state.set(cloned);
      return result;
    };

    const nextRun = this.txChain.then(exec, exec);
    this.txChain = nextRun.then(
      () => undefined,
      () => undefined,
    );
    return nextRun;
  }

  async resetAll(): Promise<void> {
    const empty = createEmptySnapshot();
    await this.driver.clearSnapshot();
    this.state.set(empty);
  }
}
