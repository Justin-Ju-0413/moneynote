import { test, expect } from '@playwright/test'
import { configureLLM } from '../helpers/configure-llm'
import { mockLLM } from '../helpers/mock-llm'

test.describe('首页聊天记账', () => {
  test('record:输入「打车15」出现卡片并确认,本月支出 +15', async ({ page }) => {
    const llm = await mockLLM(page)
    await configureLLM(page)
    await page.goto('/')

    await page.getByPlaceholder(/和助手聊聊/).fill('打车15')
    await page.getByRole('button', { name: '发送' }).click()

    await page.getByText('记一笔打车支出 ¥15?').waitFor()
    await page.getByRole('button', { name: '确认记录' }).click()
    await page.getByText('已记录').waitFor()

    await expect(page.getByText('本月支')).toContainText('¥15')
    expect(llm.count()).toBeGreaterThanOrEqual(1)
  })

  test('record → modify → delete 全链路', async ({ page }) => {
    const llm = await mockLLM(page)
    await configureLLM(page)
    await page.goto('/')

    // record
    await page.getByPlaceholder(/和助手聊聊/).fill('打车15')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认记录' }).click()
    await page.getByText('已记录').waitFor()

    // modify:mock 返回修改 50 的卡片
    await page.getByPlaceholder(/和助手聊聊/).fill('把刚才那笔改成50')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认修改' }).click()
    await page.getByText('已修改').waitFor()
    await expect(page.getByText('本月支')).toContainText('¥50')

    // delete:mock 返回删除卡片
    await page.getByPlaceholder(/和助手聊聊/).fill('删掉刚才那笔')
    await page.getByRole('button', { name: '发送' }).click()
    await page.getByRole('button', { name: '确认删除' }).click()
    await page.getByText('已删除').waitFor()
    await expect(page.getByText('本月支')).toContainText('¥0')
    expect(llm.count()).toBeGreaterThanOrEqual(3)
  })
})
