import { describe, it, expect } from 'vitest'
import { parseWithTemplate } from './universalParser'
import { ALIPAY_TEMPLATE } from './builtinTemplates'

// 用 utf-8 编码的模板避开 vitest 环境 gbk 解码差异,聚焦验证列对齐逻辑
const TEMPLATE = { ...ALIPAY_TEMPLATE, encoding: 'utf-8' as const }

// 支付宝 CSV 含"对方账号"列(第 3 列),与 ALIPAY_TEMPLATE 固定 columnIndex 错位。
// 修复前:金额列(columnIndex:5)指向"收/支",parseAmount("支出")=NaN,0 行。
// 修复后:按列名对齐,金额正确映射到第 6 列。
const ALIPAY_CSV = [
  '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,交易状态',
  '2026-07-19 23:18:25,文化休闲,Steam,acc@steam,Steam Purchase,支出,58.00,交易成功',
  '2026-07-01 10:00:00,转账红包,某公司,acc@co,工资,收入,200.00,交易成功',
  '2026-07-02 12:00:00,餐饮美食,某餐厅,acc@r,午餐,支出,35.00,交易成功',
  '2026-07-03 09:00:00,交通出行,地铁站,acc@m,地铁,/,5.00,交易成功',
].join('\n')

describe('parseWithTemplate 列对齐', () => {
  it('按列名对齐,正确解析含"对方账号"列的支付宝 CSV', async () => {
    const file = new File([ALIPAY_CSV], 'alipay.csv', { type: 'text/csv' })
    const result = await parseWithTemplate(file, TEMPLATE)

    // 地铁"收/支=/"被过滤,剩 3 行
    expect(result.totalRows).toBe(3)

    const steam = result.rows.find(r => r.fields['商品说明']?.includes('Steam'))
    expect(steam).toBeTruthy()
    expect(Number(steam!.fields['金额'])).toBe(58)
    expect(steam!.fields['收/支']).toBe('支出')

    const income = result.rows.find(r => r.fields['收/支'] === '收入')
    expect(income).toBeTruthy()
    expect(Number(income!.fields['金额'])).toBe(200)

    const food = result.rows.find(r => r.fields['交易分类'] === '餐饮美食')
    expect(food).toBeTruthy()
    expect(Number(food!.fields['金额'])).toBe(35)
  })
})
