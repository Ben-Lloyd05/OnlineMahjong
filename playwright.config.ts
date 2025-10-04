import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: [
    {
      command: 'npm run start:ws',
      port: 8080,
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: 'npx vite',
      port: 5173,
      reuseExistingServer: true,
      timeout: 120000
    }
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
});


