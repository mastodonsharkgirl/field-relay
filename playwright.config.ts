import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  webServer: { command: 'npm run dev -- --port 4661', port: 4661, reuseExistingServer: false },
  use: { baseURL: 'http://localhost:4661/labs/field-relay/' },
});
