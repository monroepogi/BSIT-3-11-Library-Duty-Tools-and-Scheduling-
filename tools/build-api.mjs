import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsxRequire = createRequire(require.resolve('tsx/package.json'));
const esbuild = tsxRequire('esbuild');

execSync('node node_modules/typescript/bin/tsc -p apps/api/tsconfig.app.json --noEmit', {
  stdio: 'inherit',
});

mkdirSync('dist/apps/api', { recursive: true });

await esbuild.build({
  entryPoints: ['apps/api/src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  tsconfig: 'apps/api/tsconfig.app.json',
  outfile: 'dist/apps/api/main.cjs',
  packages: 'external',
  sourcemap: true,
  alias: {
    '@vits/shared-types': './libs/shared-types/src/index.ts',
    '@vits/shared-crypto': './libs/shared-crypto/src/index.ts',
  },
});

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
console.log(`Built ${pkg.name} API bundle -> dist/apps/api/main.cjs`);
