import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  provideVitsSupabase,
  SUPABASE_CLIENT_FACTORY,
  type SupabaseClientFactory,
} from '@vits/shared-network';
import type { EnvironmentConfig } from '@vits/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { LibraryDatabaseService } from './library-database.service';

function makeEnv(anonKey: string): EnvironmentConfig {
  return {
    production: false,
    clientId: 'mobile',
    apiBaseUrl: 'http://localhost:3000',
    requestTimeoutMs: 5000,
    libraryTimezone: 'Asia/Manila',
    useMockApi: false,
    mockEndpoints: {
      health: false,
      identity: false,
      roster: false,
      tasks: false,
      requests: false,
      visitors: false,
      admin: false,
      audit: false,
    },
    enableDevPanel: true,
    supabase: {
      url: 'https://vits-demo.supabase.co',
      anonKey,
    },
  };
}

describe('LibraryDatabaseService', () => {
  it('falls back to local seed store when Supabase is not configured', async () => {
    TestBed.configureTestingModule({
      providers: [provideVitsSupabase(makeEnv('YOUR_SUPABASE_ANON_KEY'))],
    });

    const db = TestBed.inject(LibraryDatabaseService);
    expect(db.isConfigured).toBe(false);

    const shifts = await db.getShifts();
    expect(shifts.length).toBeGreaterThan(0);

    const added = await db.addTask({
      title: 'Sort periodicals',
      type: 'Shelving',
      section: 'Periodicals',
      assignedTo: 'Juan Dela Cruz',
      status: 'Assigned',
    });
    expect(added.title).toBe('Sort periodicals');
    const tasks = await db.getTasks();
    expect(tasks.some((t) => t.title === 'Sort periodicals')).toBe(true);
  });

  it('queries Supabase tables, executes RPCs, and queues offline mutations until flushed', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 42,
          day_label: 'Thu',
          shift_date: 'Oct 29',
          start_time: '08:00',
          end_time: '12:00',
          section: 'Reference',
          section_id: 'sec-reference',
          oic_name: 'Ms. Reyes',
          student_name: 'Juan Dela Cruz',
          student_profile_id: null,
          status: 'Scheduled',
          created_at: '2026-10-26T00:00:00Z',
          updated_at: '2026-10-26T00:00:00Z',
        },
      ],
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: { id: 99 },
      error: null,
    });
    const insertSelectMock = vi.fn().mockReturnValue({ single: insertSingleMock });
    const insertMock = vi.fn().mockReturnValue({ select: insertSelectMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock, insert: insertMock });
    const rpcMock = vi.fn().mockResolvedValue({ data: 'ok', error: null });

    const fakeClient = {
      from: fromMock,
      rpc: rpcMock,
    } as unknown as SupabaseClient<Database>;

    TestBed.configureTestingModule({
      providers: [
        provideVitsSupabase(makeEnv('sb_publishable_valid_key')),
        {
          provide: SUPABASE_CLIENT_FACTORY,
          useValue: (() => fakeClient) satisfies SupabaseClientFactory,
        },
      ],
    });

    const db = TestBed.inject(LibraryDatabaseService);
    expect(db.isConfigured).toBe(true);
    expect(db.isRemoteActive).toBe(true);

    const shifts = await db.getShifts();
    expect(shifts).toEqual([
      {
        id: 42,
        day: 'Thu',
        date: 'Oct 29',
        startTime: '08:00',
        endTime: '12:00',
        section: 'Reference',
        oic: 'Ms. Reyes',
        student: 'Juan Dela Cruz',
        status: 'Scheduled',
      },
    ]);

    const scanResult = await db.clockIn('Juan Dela Cruz', 'Ms. Reyes');
    expect(scanResult).toBe('ok');
    expect(rpcMock).toHaveBeenCalledWith('clock_in_student', {
      p_student_name: 'Juan Dela Cruz',
      p_scanned_by: 'Ms. Reyes',
    });

    // Queue write while offline, then flush when back online
    db.setOffline(true);
    await db.addTask({
      title: 'Offline task',
      type: 'Inventory',
      section: 'Circulation',
      assignedTo: 'Juan Dela Cruz',
      status: 'Assigned',
    });
    expect(db.pendingCount).toBe(1);
    expect(insertMock).not.toHaveBeenCalled();

    db.setOffline(false);
    const flushed = await db.flushPendingOperations();
    expect(flushed).toBe(1);
    expect(db.pendingCount).toBe(0);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
