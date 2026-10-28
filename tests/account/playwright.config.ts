import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../test-results/account",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15000,
    launchOptions: { executablePath: process.env.ECONTENT_CHROMIUM_PATH },
  },
  webServer: [
    {
      command: "node scripts/account-test-proxy.mjs",
      cwd: process.cwd(),
      url: "http://localhost:55321/auth/v1/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start",
      cwd: process.cwd(),
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
