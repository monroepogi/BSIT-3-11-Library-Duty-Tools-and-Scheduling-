import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_PORT, provideVitsNetwork } from '@vits/shared-network';
import type { UserProfileDto } from '@vits/shared-types';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import {
  LOCAL_DB_DRIVER,
  type LocalDbSnapshot,
  type LocalDbStorageDriver,
} from '../core/db/local-db.service';
import { VAULT_STORAGE_ADAPTER, type VaultStorageAdapter } from '../core/secure-vault.service';
import { roleGuard } from './role.guard';

function createMemoryDrivers() {
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

function configureMobileTestBed(drivers = createMemoryDrivers()) {
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

describe('roleGuard with AuthService + offline lock', () => {
  it('redirects unauthenticated users to /login, locked sessions to /unlock, and wrong roles to own home', async () => {
    configureMobileTestBed();
    const router = TestBed.inject(Router);
    const auth = TestBed.inject(AuthService);

    const unauth = await TestBed.runInInjectionContext(() =>
      roleGuard(['STUDENT'])({} as never, {} as never),
    );
    expect(unauth instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(unauth as UrlTree)).toBe('/login');

    const studentUser: UserProfileDto = {
      id: 'usr-student-maria',
      universityId: '2024-10482',
      email: 'student@university.edu',
      fullName: 'Maria Santos',
      role: 'student',
      department: 'LIS',
      active: true,
      sectionIds: ['sec-reserve'],
      sectionNames: ['Reserve'],
    };
    auth.updateTokens({
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      expiresInSec: 900,
      user: studentUser,
    });

    expect(
      await TestBed.runInInjectionContext(() => roleGuard(['STUDENT'])({} as never, {} as never)),
    ).toBe(true);

    const blockOic = await TestBed.runInInjectionContext(() =>
      roleGuard(['OIC'])({} as never, {} as never),
    );
    expect(router.serializeUrl(blockOic as UrlTree)).toBe('/student/home');

    auth.locked.set(true);
    const lockedRes = await TestBed.runInInjectionContext(() =>
      roleGuard(['STUDENT'])({} as never, {} as never),
    );
    expect(router.serializeUrl(lockedRes as UrlTree)).toBe('/unlock');
  });
});
