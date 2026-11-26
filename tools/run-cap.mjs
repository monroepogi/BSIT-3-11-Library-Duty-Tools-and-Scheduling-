import { join } from 'node:path';

/**
 * Cross-platform Capacitor CLI launcher targeting `apps/mobile`.
 */
const mobileDir = join(process.cwd(), 'apps', 'mobile');
process.chdir(mobileDir);
await import('../node_modules/@capacitor/cli/bin/capacitor');
