import { resolve } from 'node:path';
import ts from 'typescript';
import { defineConfig } from 'vitest/config';

function tsDecoratorsPlugin() {
  return {
    name: 'vits-ts-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          sourceMap: true,
        },
      });
      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      };
    },
  };
}

export default defineConfig({
  plugins: [tsDecoratorsPlugin()],
  resolve: {
    alias: {
      '@vits/shared-types': resolve(import.meta.dirname, 'libs/shared-types/src/index.ts'),
      '@vits/shared-types/fixtures': resolve(import.meta.dirname, 'libs/shared-types/fixtures/index.ts'),
      '@vits/shared-crypto': resolve(import.meta.dirname, 'libs/shared-crypto/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['libs/shared-crypto/**/*.spec.ts', 'apps/api/**/*.spec.ts'],
  },
});
