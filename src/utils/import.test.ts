import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { parseBillFile } from './import'
import type { BillTemplate } from '@/db/types'

function csvFile(name: string, text: string): File {
  return {
    name,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
  } as unknown as File
}

const ALIPAY_CSV = [
  '交易时间,交易分类,交易对方,商品说明,收/支,金额,交易状态',
  '2026-07-01 12:00:00,餐饮,示例商户,示例早餐,支出,18.50,交易成功',
  '2026-07-05 09:30:00,其他,某公司,示例兼职,收入,500.00,交易成功',
].join('\n')

describe('parseBillFile', () => {
  it('标准支付宝 CSV 命中内置模板,返回 builtin 匹配与行数据', async () => {
    const result = await parseBillFile(csvFile('alipay.csv', ALIPAY_CSV))
    expect(result.source).toBe('alipay')
    expect(result.matchType).toBe('builtin')
    expect(result.totalRows).toBe(2)
    expect(result.rows[0].fields['金额']).toBe('18.50')
    expect(result.rows[1].fields['收/支']).toBe('收入')
  })

  it('未知格式且无学习回调时明确抛错', async () => {
    const unknown = ['foo,bar,baz', '1,2,3', '4,5,6'].join('\n')
    await expect(parseBillFile(csvFile('unknown.csv', unknown))).rejects.toThrow('无法识别账单格式')
  })

  it('未知格式 + 学习回调返回 null(用户取消)时抛错', async () => {
    const unknown = ['foo,bar,baz', '1,2,3'].join('\n')
    await expect(
      parseBillFile(csvFile('unknown.csv', unknown), { onLearnRequest: async () => null }),
    ).rejects.toThrow('无法识别账单格式')
  })

  it('空文件抛「文件为空」', async () => {
    await expect(parseBillFile(csvFile('empty.csv', '   '))).rejects.toThrow('文件为空')
  })

  it('不支持的扩展名抛错', async () => {
    await expect(parseBillFile(csvFile('notes.txt', 'hello'))).rejects.toThrow('不支持的文件格式')
  })

  it('学习流程返回模板后按模板解析', async () => {
    const custom = ['商户,金额,备注,交易时间', '便利店,12.50,买水,2026-07-01'].join('\n')
    const template: BillTemplate = {
      fingerprint: '', name: '自定义', source: 'alipay', isBuiltIn: false,
      fileType: 'csv', encoding: 'utf-8', headerRowIndex: -1,
      columnMappings: [
        { columnIndex: 0, originalHeader: '商户', normalizedHeader: '商户', role: 'counterparty' },
        { columnIndex: 1, originalHeader: '金额', normalizedHeader: '金额', role: 'amount' },
        { columnIndex: 2, originalHeader: '备注', normalizedHeader: '备注', role: 'note' },
        { columnIndex: 3, originalHeader: '交易时间', normalizedHeader: '交易时间', role: 'date' },
      ],
      filterRules: [], // 简报原文遗漏必需的 filterRules 字段,补空数组
      importCount: 0, lastUsedAt: 0, createdAt: 0, updatedAt: 0,
    }
    const result = await parseBillFile(csvFile('custom.csv', custom), {
      onLearnRequest: async () => template,
    })
    expect(result.matchType).toBe('none')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].fields['金额']).toBe('12.50')
  })
})
