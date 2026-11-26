import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'edu.university.vits.mobile',
  appName: 'VITS Library',
  webDir: '../../dist/apps/mobile/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
