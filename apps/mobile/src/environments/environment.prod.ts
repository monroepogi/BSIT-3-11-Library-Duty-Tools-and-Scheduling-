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
  supabase: {
    url: 'https://oczbanwkyefufsvuahzn.supabase.co',
    anonKey: 'sb_publishable_1f9SZkZyv5CHDmWVozw7gg_zI7W-8vg',
  },
};
