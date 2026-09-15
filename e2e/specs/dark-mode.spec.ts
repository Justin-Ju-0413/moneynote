import { test, expect, type Page } from '@playwright/test'

/** 设置页切到「外观」组并等外观卡渲染 */
async function openAppearance(page: Page): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('tab', { name: '外观', exact: true }).click()
  await page.getByText('选择浅色、深色或跟随系统自动切换').waitFor()
}

test.describe('深色模式', () => {
  test('三态切换写入 data-theme,清除 localStorage 后跟随系统', async ({ page }) => {
    await openAppearance(page)

    // 切深色 → html[data-theme="dark"]，chip 呈选中态
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: '深色', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // 切回浅色 → light，且偏好写入 localStorage
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('appearance'))).toBe('light')

    // 删除 localStorage → 跟随系统：emulateMedia dark + 重载后自动应用深色
    await page.evaluate(() => localStorage.removeItem('appearance'))
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // 系统切回亮色仍为「跟随系统」态 → 重载后回到 light
    await page.emulateMedia({ colorScheme: 'light' })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    // 跟随系统 chip 恢复选中（localStorage 已清，默认态即 system）
    await page.getByRole('tab', { name: '外观', exact: true }).click()
    await expect(page.getByRole('button', { name: '跟随系统' })).toHaveAttribute('aria-pressed', 'true')
  })
})
