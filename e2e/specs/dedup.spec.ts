import { test, expect } from '@playwright/test'
import { configureLLM } from '../helpers/configure-llm'
import { mockLLM } from '../helpers/mock-llm'

test.describe('智能查重', () => {
  test('重复流水建议并合并去重,明细只剩一笔', async ({ page }) => {
    const llm = await mockLLM(page)
    await configureLLM(page)

    // 记两笔相近交易(金额相同、备注不同)
    await page.goto('/')
    await page.getByPlaceholder(/和助手聊聊/).fill('咖啡20')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认记录' }).click()
    await page.getByText('已记录').waitFor()

    await page.getByPlaceholder(/和助手聊聊/).fill('拿铁20')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认记录' }).click()
    // 等两笔都完成:waitFor('已记录') 会命中第一条 badge 立即返回或 strict 报错,无法作为第二笔的同步点
    await expect(page.getByText('已记录')).toHaveCount(2)

    // 智能查重:mock 返回 duplicate 建议(取 payload 前两个 id)
    await page.goto('/ai-workspace')
    await page.getByText('智能查重').waitFor()
    // config 从 IndexedDB 异步加载,点击前等「已连接 AI」出现,否则 runTask 会因 config 未就绪静默返回
    await page.getByText('已连接 AI').waitFor()
    await page.getByText('智能查重').click()

    await page.getByText(/新增 1 条建议/).waitFor({ timeout: 15_000 })
    await page.getByText('疑似重复').waitFor()

    await page.getByRole('button', { name: '合并去重' }).click()
    await page.getByText('已应用建议').waitFor()

    // 合并后删除后续笔,明细只剩「咖啡」
    await page.goto('/history')
    await expect(page.getByText('咖啡')).toBeVisible()
    await expect(page.getByText('拿铁')).toHaveCount(0)
    expect(llm.count()).toBeGreaterThan(0)
  })
})
