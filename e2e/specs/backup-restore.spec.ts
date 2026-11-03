import { test, expect, type Page } from '@playwright/test'

/** 首页聊天本地规则路径记一笔（无 LLM 依赖），保证备份/导出有数据 */
async function recordViaChat(page: Page, text: string): Promise<void> {
  await page.goto('/')
  await page.getByPlaceholder(/和助手聊聊/).fill(text)
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('button', { name: '确认记录' }).click()
  await page.getByText('已记录').waitFor()
}

test.describe('备份与恢复', () => {
  test('手动备份→列表条目→恢复,导出 JSON 触发下载', async ({ page }) => {
    await recordViaChat(page, '奶茶9')

    // 设置页「数据」组 → 备份卡
    await page.goto('/settings')
    await page.getByRole('tab', { name: '数据', exact: true }).click()
    await page.getByText('数据备份', { exact: true }).waitFor()

    // 手动备份 → 备份列表出现新条目（kind=manual；自动备份开启时列表可能同时出现「自动」行，按行内文本锁定手动条目）
    await page.getByRole('button', { name: '立即备份' }).click()
    await page.getByText('已创建备份').waitFor()
    await expect(page.getByText('手动', { exact: true })).toBeVisible()

    // 恢复该手动备份：行内「恢复」与确认弹窗「恢复」同名，先按行收窄、再按 dialog 作用域收窄
    const manualRow = page.locator('div.rounded-button').filter({ hasText: '手动' })
    await manualRow.getByRole('button', { name: '恢复' }).click()
    const dialog = page.getByRole('dialog', { name: '恢复备份' })
    await dialog.waitFor()
    await expect(dialog.getByText(/确认恢复到/)).toBeVisible()
    await dialog.getByRole('button', { name: '恢复', exact: true }).click()
    await page.getByText('已恢复，刷新页面以生效').waitFor()

    // 导出 JSON 触发下载事件（learning.spec 的导出断言模式）
    const downloadPromise = page.waitForEvent('download')
    await page.getByText('导出 JSON', { exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^moneynote_\d{4}-\d{2}-\d{2}\.json$/)
  })
})
