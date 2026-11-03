// 组件/hook 测试公共 setup：jest-dom matchers + RTL 自动 cleanup。
// 项目未开 vitest globals（既有单测显式 import），故手动注册 afterEach。
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
