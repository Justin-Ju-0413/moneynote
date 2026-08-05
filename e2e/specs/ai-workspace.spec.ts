import { test, expect } from '@playwright/test'
import { configureLLM } from '../helpers/configure-llm'
import { mockLLM } from '../helpers/mock-llm'

test.describe('AI 工作台', () => {
  test('综合审计返回分类建议并可应用', async ({ page }) => {
    const llm = await mockLLM(page)
    await configureLLM(page)

    // 先记一笔,让工作台有数据可审
    await page.goto('/')
    await page.getByPlaceholder(/和助手聊聊/).fill('午餐35')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认记录' }).click()
    await page.getByText('已记录').waitFor()

    await page.goto('/ai-workspace')
    await page.getByText('综合审计').waitFor()
    // config 从 IndexedDB 异步加载,点击前等「已连接 AI」出现,否则 runTask 会因 config 未就绪静默返回
    await page.getByText('已连接 AI').waitFor()
    await page.getByText('综合审计').click()

    await page.getByText(/新增 1 条建议/).waitFor({ timeout: 15_000 })
    await page.getByText('分类建议', { exact: true }).waitFor()

    await page.getByRole('button', { name: '应用' }).click()
    await page.getByText('已应用建议').waitFor()
    expect(llm.count()).toBeGreaterThan(0)
  })
})
