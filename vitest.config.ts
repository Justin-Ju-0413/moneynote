import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // jsdom 全局环境：组件/hook 测试需要 DOM；fake-indexeddb 在 jsdom 下同样可用
    // （vitest 的 jsdom 环境保留 node 全局如 structuredClone），既有 node 单测无需逐文件切换。
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // 只出终端报告：默认 reporter 集会在 coverage/ 落 html/js 资产，被 eslint 扫出告警
      // （注意 vitest 4 的键名是 reporter 单数，reporters 会被静默忽略）
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/App.tsx',
        // UpdatePrompt 依赖 vite-plugin-pwa 的 virtual 模块，coverage 解析器无法处理
        // （ rolldown PARSE_ERROR，会被静默剔除），显式排除消噪
        'src/components/ui/UpdatePrompt.tsx',
      ],
      // 「现状略降」安全线：低于实测值、且不超过 45/35 上限，避免阈值卡死后续迭代
      thresholds: {
        lines: 35,
        functions: 30,
        statements: 35,
        branches: 25,
      },
    },
  },
})
