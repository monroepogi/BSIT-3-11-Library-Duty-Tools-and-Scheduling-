import type { EnvironmentConfig } from '@vits/shared-types';

export const environment: EnvironmentConfig = {
  production: false,
  clientId: 'mobile',
  apiBaseUrl: 'http://localhost:3000',
  requestTimeoutMs: 8000,
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
  enableDevPanel: true,
};
