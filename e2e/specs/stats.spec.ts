import { test, expect, type Page } from '@playwright/test'

/** 首页聊天本地规则路径记一笔（无 LLM 依赖），返回后交易已确认入库 */
async function recordViaChat(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(/和助手聊聊/).fill(text)
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('button', { name: '确认记录' }).click()
}

test.describe('统计页', () => {
  test('导入示例账单后,月视图摘要/分类图例/月度对比卡正确', async ({ page }) => {
    // 造数：导入 public/sample-data.csv（2026-07 三笔：支出 18.50 + 6.00，收入 500）。
    // 该格式非内置模板 → 触发模板学习流，ColumnMappingDialog 默认建议已含 date/amount/direction 列
    await page.goto('/settings')
    await page.getByRole('tab', { name: '数据', exact: true }).click()
    await page.getByText('导入账单', { exact: true }).waitFor()
    await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles('public/sample-data.csv')

    await page.getByRole('dialog', { name: '确认列映射' }).waitFor()
    await page.getByRole('button', { name: '确认并导入' }).click()
    await page.getByText(/导入完成，新增 3 笔/).waitFor({ timeout: 15_000 })

    // 统计页：月周期（默认即月，此处显式点击锁定口径），翻回 2026 年 7 月查看导入数据
    await page.goto('/stats')
    await page.getByRole('button', { name: '月', exact: true }).click()
    await page.getByLabel('上一期').click()
    await page.getByLabel('上一期').click()
    await expect(page.getByText('2026年7月', { exact: true })).toBeVisible()

    // 摘要卡金额非零：支出 24.50 / 收入 500.00
    await expect(page.getByText('¥24.50')).toBeVisible()
    await expect(page.getByText('¥500.00')).toBeVisible()

    // 分类占比图例出现（分类名文本；备注「示例早餐/示例地铁」经关键词归到 餐饮/交通）
    await expect(page.getByText('餐饮', { exact: true })).toBeVisible()
    await expect(page.getByText('交通', { exact: true })).toBeVisible()

    // 月度对比卡：本月（7月）有柱、上月（6月）无记录 → 兜底文案
    await expect(page.getByText('月度对比', { exact: true })).toBeVisible()
    await expect(page.getByText('上月无记录')).toBeVisible()
  })

  test('本月超 5 个分类时,排行榜「展开全部」可交互', async ({ page }) => {
    // 造数：本地规则记 6 笔不同分类支出（金额与分类关键词均不同，无需 LLM）
    const items = ['奶茶12', '打车15', '买衣服59', '电影票40', '房租30', '感冒买药25']
    await page.goto('/')
    for (const text of items) {
      await recordViaChat(page, text)
    }
    // 与 dedup.spec 同因：「已记录」badge 按条计数等待，作为全部确认完成的同步点
    await expect(page.getByText('已记录')).toHaveCount(items.length)

    // 统计页当前月：摘要非零（12+15+59+40+30+25 = 181）
    await page.goto('/stats')
    await expect(page.getByText('¥181.00')).toBeVisible()

    // 折叠态只显 Top5（按金额降序），金额最小的 餐饮(12) 被收起；展开按钮带总数
    await expect(page.getByText('餐饮', { exact: true })).toHaveCount(0)
    const expand = page.getByRole('button', { name: '展开全部 6 个分类' })
    await expect(expand).toBeVisible()
    await expand.click()

    // 展开后：按钮变「收起」，第 6 个分类可见
    await expect(page.getByRole('button', { name: '收起', exact: true })).toBeVisible()
    await expect(page.getByText('餐饮', { exact: true })).toBeVisible()
  })
})
