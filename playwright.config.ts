import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: 'npm run dev -- --port 4796 --force',
    port: 4796,
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://localhost:4796/labs/field-relay/' },
});
