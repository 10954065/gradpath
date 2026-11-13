import { defineConfig, devices } from '@playwright/test'
import { STUDENT_STATE } from './tests/e2e/support'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // The app honours reduced motion, which keeps step transitions deterministic for tests.
    reducedMotion: 'reduce',
    // No service worker by default: each test gets a fresh context, and the worker's one-off "ready to work
    // offline" notice would otherwise appear mid-test. offline.spec.ts opts back in.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Creates a throwaway student, signs in and onboards through the UI, and saves the session.
    { name: 'setup', testMatch: /student\.setup\.ts/, use: { ...devices['Desktop Chrome'] }, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: /global\.teardown\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: STUDENT_STATE },
      dependencies: ['setup'],
      testIgnore: /responsive\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], storageState: STUDENT_STATE }, dependencies: ['setup'], testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        // Never reuse: a leftover preview server would silently serve an old build.
        reuseExistingServer: false,
        timeout: 240_000,
      },
})
