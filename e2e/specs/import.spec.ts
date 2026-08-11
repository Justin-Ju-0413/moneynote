import { test, expect } from '@playwright/test'

test.describe('账单导入', () => {
  test('导入支付宝 CSV,明细页出现两笔', async ({ page }) => {
    await page.goto('/settings')
    await page.getByText('导入账单').waitFor()

    await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles('e2e/fixtures/bills/alipay.csv')
    await page.getByText(/导入完成，新增 2 笔/).waitFor({ timeout: 15_000 })

    await page.goto('/history')
    await expect(page.getByText('示例早餐')).toBeVisible()
    await expect(page.getByText('示例兼职')).toBeVisible()
  })
})
