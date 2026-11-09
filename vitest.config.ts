import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  resolve: {
    alias: {
      vscode: fromRoot('./test/vscodeStub.ts'),
      '@shared': fromRoot('./src/shared'),
      '@api-types': fromRoot('./src/api/types.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
