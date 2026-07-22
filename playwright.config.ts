import { defineConfig, devices } from '@playwright/test'

const configuredPath = process.env.PUBLIC_APP_PATH || ''
const segments = configuredPath.split('/').filter(Boolean)
const appPath = segments.length ? `/${segments.join('/')}/` : '/'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: `http://127.0.0.1:4173${appPath}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  metadata: { appPath },
})

export { appPath }
