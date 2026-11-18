import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 70_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Uses the system Edge by default. Set PLAYWRIGHT_CHANNEL=chromium after
    // `npx playwright install chromium` on machines without Edge.
    channel: (process.env.PLAYWRIGHT_CHANNEL as 'msedge' | 'chromium' | undefined) || 'msedge',
    headless: true,
    // The drawer gesture is a horizontal swipe. Desktop Chromium reserves that
    // gesture for browser back/forward history and would navigate to
    // about:blank instead; the WebView shell has no such browser chrome.
    launchOptions: {
      args: ['--disable-features=OverscrollHistoryNavigation'],
    },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node tests/mock-server.mjs',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
      timeout: 15_000,
    },
    {
      command: 'pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
