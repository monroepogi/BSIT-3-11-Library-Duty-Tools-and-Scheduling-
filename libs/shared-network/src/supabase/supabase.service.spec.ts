import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnvironmentConfig } from '@vits/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  isValidSupabaseConfig,
  provideVitsSupabase,
  SUPABASE_CLIENT_FACTORY,
  type SupabaseClientFactory,
  SupabaseService,
} from './supabase.service';

function makeEnv(url: string, anonKey: string): EnvironmentConfig {
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
    supabase: { url, anonKey },
  };
}

describe('SupabaseService', () => {
  it('validates placeholder vs real Supabase config values', () => {
    expect(isValidSupabaseConfig(null)).toBe(false);
    expect(isValidSupabaseConfig({ url: 'http://127.0.0.1:54321', anonKey: 'YOUR_SUPABASE_ANON_KEY' })).toBe(false);
    expect(isValidSupabaseConfig({ url: 'https://YOUR_PROJECT_REF.supabase.co', anonKey: 'real-key' })).toBe(false);
    expect(isValidSupabaseConfig({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_123' })).toBe(true);
  });

  it('returns null and reports unconfigured health when credentials are placeholders', async () => {
    TestBed.configureTestingModule({
      providers: [provideVitsSupabase(makeEnv('http://127.0.0.1:54321', 'YOUR_SUPABASE_ANON_KEY'))],
    });

    const service = TestBed.inject(SupabaseService);
    expect(service.isConfigured).toBe(false);
    expect(service.getClientOrNull()).toBeNull();
    expect(() => service.getClient()).toThrowError(/Supabase is not configured/);

    const health = await service.checkHealth();
    expect(health.configured).toBe(false);
    expect(health.ok).toBe(false);
  });

  it('creates a singleton typed client via factory and executes health check', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [{ id: 'sec-circulation' }], error: null });
    const selectMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    const fakeClient = { from: fromMock } as unknown as SupabaseClient<Database>;
    const factory = vi.fn<SupabaseClientFactory>(() => fakeClient);

    TestBed.configureTestingModule({
      providers: [
        provideVitsSupabase(makeEnv('https://vits-test.supabase.co', 'anon-key-123')),
        { provide: SUPABASE_CLIENT_FACTORY, useValue: factory },
      ],
    });

    const service = TestBed.inject(SupabaseService);
    expect(service.isConfigured).toBe(true);
    expect(service.getClient()).toBe(fakeClient);
    expect(service.getClient()).toBe(fakeClient);
    expect(factory).toHaveBeenCalledTimes(1);

    const health = await service.checkHealth();
    expect(health.configured).toBe(true);
    expect(health.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('library_sections');
  });
});
