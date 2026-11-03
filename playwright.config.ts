import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // 桌面端：跑全部非移动专属 spec（既有 6 个 + R3 新增 desktop spec）
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testIgnore: /mobile-.*\.spec\.ts/,
    },
    {
      // 移动端视口：只跑移动专属 spec，控制 CI 时长。
      // iPhone 13 描述符默认 webkit，显式覆盖为 chromium（CI 只装 chromium）；
      // 1.62 的描述符 viewport 为 390x664（Safari 可视区），按规格显式取整屏 390x844，
      // 保留 isMobile/hasTouch/deviceScaleFactor 移动仿真
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } },
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    port: 4173,
    // 本地复用常驻 preview 省时；CI 强制新起，避免串到残留服务
    reuseExistingServer: !process.env.CI,
  },
})
