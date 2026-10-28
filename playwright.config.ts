import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', timeout: 300000, workers: 1,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', actionTimeout: 15000 },
  webServer: { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
})
