import { test, expect } from '@playwright/test'

test.describe('AI 学习规则', () => {
  test('设置页学习规则可见且可删除', async ({ page }) => {
    // 准备：通过首页聊天记录一笔，生成 manual 规则（本地 NLP 回退，无需 LLM）
    await page.goto('/')
    await page.getByPlaceholder(/和助手聊聊/).fill('测试商户奶茶20')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认记录' }).waitFor()
    await page.getByRole('button', { name: '确认记录' }).click()
    // 「已记录」badge 在 confirmCard 全链路（含 recordLearning 写入）完成后才出现，作为导航前的同步点
    await page.getByText('已记录').waitFor()

    // 设置页看到学习规则（merchant 为去除金额后的备注文本）
    await page.goto('/settings')
    await page.getByText('学习规则').waitFor()
    await expect(page.getByText('测试商户奶茶')).toBeVisible()
    await expect(page.getByText('手动')).toBeVisible()

    // 删除规则（限定在规则行内，避免命中分类管理的删除按钮）
    const ruleRow = page.locator('div.flex.items-center.justify-between', { hasText: '测试商户奶茶' })
    await ruleRow.getByRole('button', { name: '删除' }).click()
    await expect(page.getByText('测试商户奶茶')).not.toBeVisible()
  })
})
