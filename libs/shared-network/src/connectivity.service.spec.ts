import { TestBed } from '@angular/core/testing';
import type { EnvironmentConfig } from '@vits/shared-types';
import { describe, expect, it } from 'vitest';
import { ConnectivityService } from './connectivity.service';
import { provideVitsNetwork } from './interceptors';
import { MockChaosService } from './mock-chaos.service';

const MOCK_ENV: EnvironmentConfig = {
  production: false,
  clientId: 'mobile',
  apiBaseUrl: 'http://localhost:3000',
  requestTimeoutMs: 1000,
  libraryTimezone: 'Asia/Manila',
  useMockApi: true,
  mockEndpoints: {
    health: true,
    identity: true,
    roster: true,
    tasks: true,
    requests: true,
    visitors: true,
    admin: true,
    audit: true,
  },
  enableDevPanel: false,
};

describe('ConnectivityService', () => {
  it('switches online state with forcedOffline and probes GET /v1/health', async () => {
    TestBed.configureTestingModule({
      providers: [provideVitsNetwork(MOCK_ENV)],
    });

    const connectivity = TestBed.inject(ConnectivityService);
    const chaos = TestBed.inject(MockChaosService);

    chaos.latencyMs.set(0);
    expect(connectivity.isOnline()).toBe(true);

    chaos.forcedOffline.set(true);
    expect(connectivity.isOnline()).toBe(false);

    chaos.forcedOffline.set(false);
    connectivity.reportTransportFailure();
    expect(connectivity.apiReachable()).toBe(false);

    connectivity.probeNow();
    await new Promise((r) => setTimeout(r, 30));
    expect(connectivity.apiReachable()).toBe(true);
    expect(connectivity.isOnline()).toBe(true);
    expect(connectivity.lastCheckedAt()).toBeTruthy();
  });
});
