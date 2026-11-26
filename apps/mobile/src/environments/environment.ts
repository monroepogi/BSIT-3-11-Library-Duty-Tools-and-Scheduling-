import type { EnvironmentConfig } from '@vits/shared-types';

export const environment: EnvironmentConfig = {
  production: false,
  clientId: 'mobile',
  apiBaseUrl: 'http://localhost:3000',
  requestTimeoutMs: 8000,
  libraryTimezone: 'Asia/Manila',
  useMockApi: true,
  mockEndpoints: {
    health: false,
    identity: false,
    roster: false,
    tasks: false,
    requests: true,
    visitors: true,
    admin: true,
    audit: true,
  },
  enableDevPanel: false,
};
