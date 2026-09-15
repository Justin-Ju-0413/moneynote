import { test, expect } from '@playwright/test'

test.describe('账单导入', () => {
  test('导入支付宝 CSV,明细页出现两笔', async ({ page }) => {
    await page.goto('/settings')
    // 设置页分组导航：默认组为「AI 智能」，导入入口在「数据」组
    await page.getByRole('tab', { name: '数据', exact: true }).click()
    // exact:设置页新增副标题「导入账单文件…」含同段子串,非精确匹配会命中 2 个元素触发 strict mode 冲突
    await page.getByText('导入账单', { exact: true }).waitFor()

    await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles('e2e/fixtures/bills/alipay.csv')
    await page.getByText(/导入完成，新增 2 笔/).waitFor({ timeout: 15_000 })

    await page.goto('/history')
    await expect(page.getByText('示例早餐')).toBeVisible()
    await expect(page.getByText('示例兼职')).toBeVisible()
  })
})
