import type { EnvironmentConfig } from '@vits/shared-types';

export const environment: EnvironmentConfig = {
  production: true,
  clientId: 'mobile',
  apiBaseUrl: 'https://api.vits.university.edu',
  requestTimeoutMs: 15000,
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
  enableDevPanel: false,
};
