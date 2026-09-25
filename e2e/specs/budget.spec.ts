import { test, expect, type Page } from '@playwright/test'

/** 首页聊天本地规则路径记一笔（无 LLM 依赖） */
async function recordViaChat(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(/和助手聊聊/).fill(text)
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('button', { name: '确认记录' }).click()
  await page.getByText('已记录').waitFor()
}

test.describe('预算页', () => {
  test('总预算/分类预算设置,进度条与使用率分档文案', async ({ page }) => {
    // 造数：本地规则记一笔交通支出 200（本月，无需 LLM）
    await page.goto('/')
    await recordViaChat(page, '打车200')

    await page.goto('/budget')
    // 初始态：总预算未设置
    await expect(page.getByText('点击设置月度总预算')).toBeVisible()

    // 设置总预算 250：200/250 = 80% → warning 档（amber「接近预算」）
    await page.getByText('月度总预算', { exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置预算' })
    await dialog.waitFor()
    await dialog.getByPlaceholder('输入预算金额').fill('250')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('预算已保存').waitFor()

    // 进度条出现（总预算 + 分类行共用 track 样式）与百分比文案
    await expect(page.getByText('/ ¥250')).toBeVisible()
    await expect(page.locator('div.bg-primary-100 > div').first()).toBeVisible()
    await expect(page.getByText('已用 80%，接近预算')).toBeVisible()

    // 设置分类预算：交通 220，200/220 ≈ 91% → warning 档「注意控制」
    await page.getByText('交通', { exact: true }).click()
    await dialog.waitFor()
    await expect(dialog.getByText('交通 预算')).toBeVisible()
    await dialog.getByPlaceholder('输入预算金额').fill('220')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    // 第一次保存的 toast（2.5s 生命周期）可能仍在场，按计数等待第二次保存完成
    await expect(page.getByText('预算已保存')).toHaveCount(2)

    // 分类行出现：金额对 + amber 分档文案
    await expect(page.getByText('¥200 / ¥220')).toBeVisible()
    await expect(page.getByText('已用 91%，注意控制')).toBeVisible()
  })
})
