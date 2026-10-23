import { defineConfig } from '@playwright/test';
export default defineConfig({
  workers: 1,
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: 'npm run preview -- --port 4796',
    port: 4796,
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://localhost:4796/labs/field-relay/' },
});
