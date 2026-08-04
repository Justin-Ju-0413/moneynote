import type { Page } from '@playwright/test'

// 通过设置页 UI 配置 LLM(端点指向本地 preview,由 mockLLM 拦截)
export async function configureLLM(page: Page): Promise<void> {
  await page.goto('/settings')
  await page.getByText('AI 智能解析').waitFor()
  await page.locator('button.w-10.h-5').first().click()
  await page.getByPlaceholder('https://api.example.com').fill('http://localhost:4173/mock')
  await page.getByPlaceholder('sk-...').fill('sk-e2e-test')
  await page.getByPlaceholder('deepseek-v4-flash / gpt-4.1-nano').fill('deepseek-v4-flash')
  await page.getByRole('button', { name: '保存配置' }).click()
  await page.getByText('配置已保存').waitFor({ timeout: 5000 })
}
