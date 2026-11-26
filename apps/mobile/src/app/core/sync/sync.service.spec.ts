import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_PORT, MockChaosService, provideVitsNetwork } from '@vits/shared-network';
import { getLibraryDateString, type ShiftDto, type TaskDto, type UserProfileDto } from '@vits/shared-types';
import { environment } from '../../../environments/environment';
import { HomePage } from '../../pages/shared/home/home.page';
import { TasksPage } from '../../pages/shared/tasks/tasks.page';
import { AuthService } from '../auth.service';
import {
  LOCAL_DB_DRIVER,
  LocalDbService,
  type LocalDbSnapshot,
  type LocalDbStorageDriver,
} from '../db/local-db.service';
import { OutboxRepository, ShiftsRepository, TasksRepository } from '../db/repositories';
import { VAULT_STORAGE_ADAPTER, type VaultStorageAdapter } from '../secure-vault.service';
import { SyncService } from './sync.service';

function createPersistentDrivers() {
  let dbSnap: string | null = null;
  const kv = new Map<string, string>();
  const dbDriver: LocalDbStorageDriver = {
    async readSnapshot(): Promise<LocalDbSnapshot | null> {
      return dbSnap ? (JSON.parse(dbSnap) as LocalDbSnapshot) : null;
    },
    async writeSnapshot(snapshot: LocalDbSnapshot): Promise<void> {
      dbSnap = JSON.stringify(snapshot);
    },
    async clearSnapshot(): Promise<void> {
      dbSnap = null;
    },
  };
  const vaultDriver: VaultStorageAdapter = {
    async get(k) {
      return kv.get(k) ?? null;
    },
    async set(k, v) {
      kv.set(k, v);
    },
    async remove(k) {
      kv.delete(k);
    },
  };
  return { dbDriver, vaultDriver };
}

function setupApp(drivers: ReturnType<typeof createPersistentDrivers>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideVitsNetwork(environment),
      { provide: AUTH_SESSION_PORT, useExisting: AuthService },
      { provide: LOCAL_DB_DRIVER, useValue: drivers.dbDriver },
      { provide: VAULT_STORAGE_ADAPTER, useValue: drivers.vaultDriver },
    ],
  });
}

describe('Mobile Offline Persistence, Transaction Rollback & Cache-First UI (Phases 4–5)', () => {
  it('persists offline outbox writes & PIN across simulated app restart and supports offline unlock', async () => {
    const drivers = createPersistentDrivers();
    setupApp(drivers);

    const auth1 = TestBed.inject(AuthService);
    const tasksRepo1 = TestBed.inject(TasksRepository);
    const outbox1 = TestBed.inject(OutboxRepository);

    const today = getLibraryDateString(new Date(), 'Asia/Manila');
    const student: UserProfileDto = {
      id: 'usr-student-maria',
      universityId: '2024-10482',
      email: 'student@university.edu',
      fullName: 'Maria Santos',
      role: 'student',
      department: 'LIS',
      active: true,
      sectionIds: ['sec-reserve'],
      sectionNames: ['Reserve & Thesis Section'],
    };

    auth1.updateTokens({
      accessToken: 'acc-live',
      refreshToken: 'ref-live',
      expiresInSec: 900,
      user: student,
    });
    await auth1.setupOfflinePin('2580');

    const seededTask: TaskDto = {
      id: 'tsk-offline-1',
      shiftId: `shf-${today}`,
      sectionId: 'sec-reserve',
      sectionName: 'Reserve & Thesis Section',
      category: 'shelving',
      assignedToUserId: student.id,
      assignedToName: student.fullName,
      createdByUserId: 'usr-oic-carlo',
      createdByName: 'Carlo Reyes',
      title: 'Shelve encyclopedias offline',
      description: null,
      status: 'todo',
      completedAt: null,
      version: 1,
    };
    await tasksRepo1.replaceTasks([seededTask]);
    await tasksRepo1.updateLocalTaskStatus(seededTask.id, 'done');
    await outbox1.enqueue({
      entityType: 'task',
      entityId: seededTask.id,
      type: 'task.update_status',
      label: 'Task done offline',
      payload: { status: 'done' },
    });

    // Simulate full app restart by resetting TestBed while keeping persistent storage
    setupApp(drivers);
    const auth2 = TestBed.inject(AuthService);
    const tasksRepo2 = TestBed.inject(TasksRepository);
    const outbox2 = TestBed.inject(OutboxRepository);

    await auth2.ensureInitialized();
    expect(auth2.locked()).toBe(true);
    expect(await auth2.unlockWithPin('0000')).toBe(false);
    expect(await auth2.unlockWithPin('2580')).toBe(true);
    expect(outbox2.pendingCount()).toBe(1);
    expect(tasksRepo2.tasks()[0].status).toBe('done');
    expect(tasksRepo2.tasks()[0].pendingSync).toBe(true);
  });

  it('does not advance sync cursor when pull transaction fails mid-flight', async () => {
    const drivers = createPersistentDrivers();
    setupApp(drivers);
    const db = TestBed.inject(LocalDbService);
    await db.init();

    await expect(
      db.runTransaction((draft) => {
        draft.syncState.cursor = 42;
        throw new Error('Simulated mid-pull SQLite crash');
      }),
    ).rejects.toThrow('Simulated mid-pull SQLite crash');

    expect(db.state().syncState.cursor).toBe(0);
    await db.reloadFromDisk();
    expect(db.state().syncState.cursor).toBe(0);
  });

  it('renders HomePage and TasksPage immediately from local cache while completely offline', async () => {
    const drivers = createPersistentDrivers();
    setupApp(drivers);

    const auth = TestBed.inject(AuthService);
    const chaos = TestBed.inject(MockChaosService);
    const shiftsRepo = TestBed.inject(ShiftsRepository);
    const tasksRepo = TestBed.inject(TasksRepository);

    chaos.forcedOffline.set(true);
    const today = getLibraryDateString(new Date(), 'Asia/Manila');
    const student: UserProfileDto = {
      id: 'usr-student-maria',
      universityId: '2024-10482',
      email: 'student@university.edu',
      fullName: 'Maria Santos',
      role: 'student',
      department: 'LIS',
      active: true,
      sectionIds: ['sec-reserve'],
      sectionNames: ['Reserve & Thesis Section'],
    };
    auth.updateTokens({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      expiresInSec: 900,
      user: student,
    });

    const shift: ShiftDto = {
      id: 'shf-cached-today',
      semesterId: 'sem-2026-1',
      sectionId: 'sec-reserve',
      sectionCode: 'RES-3F',
      sectionName: 'Reserve & Thesis Section',
      location: '3F North Reading Room',
      userId: student.id,
      userFullName: student.fullName,
      oicName: 'Carlo Reyes',
      shiftDate: today,
      startsAt: `${today}T08:00:00+08:00`,
      endsAt: `${today}T12:00:00+08:00`,
      durationMinutes: 240,
      roleInShift: 'student',
      status: 'in_progress',
      attendance: { checkInAt: `${today}T08:00:00+08:00`, checkOutAt: null, verificationStatus: 'verified' },
      signedOffBy: null,
      signedOffAt: null,
      signoffRemarks: null,
      version: 1,
    };
    await shiftsRepo.replaceShifts([shift]);
    await shiftsRepo.setHoursSummary({
      semesterId: 'sem-2026-1',
      semesterName: '1st Sem',
      renderedMinutes: 1440,
      weeklyRenderedMinutes: 240,
      approvedLeaveMinutes: 0,
      pendingMinutes: 0,
      semesterCapMinutes: 3600,
      weeklyCapMinutes: 600,
    });
    await tasksRepo.replaceTasks([
      {
        id: 'tsk-cached-1',
        shiftId: shift.id,
        sectionId: 'sec-reserve',
        sectionName: 'Reserve & Thesis Section',
        category: 'inventory',
        assignedToUserId: student.id,
        assignedToName: student.fullName,
        createdByUserId: 'usr-oic-carlo',
        createdByName: 'Carlo Reyes',
        title: 'Audit reserve shelf A',
        description: null,
        status: 'todo',
        completedAt: null,
        version: 1,
      },
    ]);

    const homeFixture = TestBed.createComponent(HomePage);
    homeFixture.detectChanges();
    expect(homeFixture.nativeElement.textContent).toContain('Maria Santos');
    expect(homeFixture.nativeElement.textContent).toContain('You are ON DUTY');
    expect(homeFixture.nativeElement.textContent).toContain('Offline mode');

    const tasksFixture = TestBed.createComponent(TasksPage);
    tasksFixture.detectChanges();
    expect(tasksFixture.nativeElement.textContent).toContain('Audit reserve shelf A');

    // SyncService stays idle safely when offline
    const sync = TestBed.inject(SyncService);
    await sync.syncNow();
    expect(sync.syncing()).toBe(false);
  });
});
