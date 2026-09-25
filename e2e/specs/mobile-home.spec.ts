import { test, expect } from '@playwright/test'

// 移动端专属（mobile project，iPhone 13 视口 390x844）：
// 仅此文件匹配 /mobile-.*\.spec\.ts，desktop chromium project 通过 testIgnore 跳过
test.describe('移动端首页', () => {
  test('底栏 6 tab 可见,统计路由跳转与 active 态,聊天输入区不被遮挡', async ({ page }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

    await page.goto('/')
    // 底部导航（桌面侧栏 aside 虽在 DOM 但 display:none，用 lg:hidden 类锁定底栏）
    const nav = page.locator('nav[class*="lg:hidden"]')
    await expect(nav).toBeVisible()
    for (const label of ['记账', '统计', '明细', '预算', 'AI', '设置']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }

    // 点「统计」→ 路由跳转成功 + 底栏 active 态（react-router NavLink 自动加 aria-current）
    const statsTab = nav.getByRole('link', { name: '统计', exact: true })
    await statsTab.click()
    await expect(page).toHaveURL(/\/stats$/)
    await expect(page.getByRole('heading', { name: '统计', exact: true })).toBeVisible()
    await expect(statsTab).toHaveAttribute('aria-current', 'page')

    // 回首页：聊天输入区可见、在视口内、可点击可输入（elementFromPoint 验证未被底栏遮挡）
    await nav.getByRole('link', { name: '记账', exact: true }).click()
    // 页面切换动画期间旧页（/stats）仍挂载会撑高文档，等其卸载后再测量
    await page.getByRole('heading', { name: '统计', exact: true }).waitFor({ state: 'detached' })
    const input = page.getByPlaceholder(/和助手聊聊/)
    await expect(input).toBeVisible()
    const box = await input.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    const hitTag = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.tagName,
      [box!.x + box!.width / 2, box!.y + box!.height / 2],
    )
    expect(hitTag).toBe('TEXTAREA')
    await input.click()
    await input.fill('奶茶20')
    await expect(input).toHaveValue('奶茶20')
  })
})
