import type { BillTemplate, ColumnMapping, ColumnRole, ColumnType, FilterRule, TemplateFingerprint } from '@/db/types'
import type { LLMConfig } from '@/llm/types'
import type { RawBillRow } from '@/utils/import'
import {
  detectHeaderRow,
  inferColumnTypes,
  inferColumnRoles,
  generateFingerprint,
  parseFileToGrid,
} from './analyzer'
import { aiAssistColumnMapping } from './aiMapper'
import { previewParse } from './universalParser'

// ── 学习上下文（传递给 UI 确认）──

export interface LearningContext {
  grid: (string | number | Date)[][]
  fileType: 'csv' | 'xlsx'
  encoding?: 'gbk' | 'utf-8'
  fingerprint: TemplateFingerprint
  headers: string[]
  rawHeaders: string[]
  columnTypes: ColumnType[]
  columnRoles: (ColumnRole | null)[]
  columnMappings: ColumnMapping[]
  filterRules: FilterRule[]
  preview: RawBillRow[]
  warnings: string[]
  suggestedName: string
  buildClassifyTextFrom: number[]
}

// ── 学习流程编排 ──

/**
 * 分析未知格式文件，返回学习上下文供用户确认。
 * 如果启发式无法确定关键列角色，可选调用 AI 辅助。
 */
export async function analyzeUnknownFile(
  file: File,
  options?: { llmConfig?: LLMConfig },
): Promise<LearningContext> {
  // 1. 读取文件为二维数组
  const { data, fileType, encoding } = await parseFileToGrid(file)

  // 2. 定位表头
  const detection = detectHeaderRow(data, fileType)

  // 3. 推断列类型
  const columnTypes = inferColumnTypes(data, detection.headerIndex)

  // 4. 提取样本行
  const sampleRows: string[][] = []
  const sampleEnd = Math.min(detection.headerIndex + 31, data.length)
  for (let i = detection.headerIndex + 1; i < sampleEnd; i++) {
    const row = data[i]
    if (!row) continue
    sampleRows.push(row.map(c => String(c ?? '').trim()))
  }

  // 5. 启发式角色推断
  let roles = inferColumnRoles(detection.headers, columnTypes, sampleRows)

  // 6. 检查关键角色是否缺失
  const hasDate = roles.includes('date')
  const hasAmount = roles.includes('amount')
  const needsAI = !hasDate || !hasAmount

  // 7. AI 辅助（仅在需要且可用时）
  if (needsAI && options?.llmConfig) {
    roles = await aiAssistColumnMapping(
      options.llmConfig,
      detection.headers,
      sampleRows,
      roles,
    )
  }

  // 8. 生成列映射
  const columnMappings = generateColumnMappings(
    detection.headers,
    detection.rawHeaders,
    roles,
    columnTypes,
    sampleRows,
  )

  // 9. 生成过滤规则
  const filterRules = generateFilterRules(columnMappings, sampleRows)

  // 10. 生成指纹
  const fingerprint = generateFingerprint(fileType, encoding, detection.headerIndex, detection.headers)

  // 11. 试解析预览
  const tempTemplate: BillTemplate = {
    fingerprint: fingerprint.headerHash,
    name: '',
    source: 'custom',
    isBuiltIn: false,
    fileType,
    encoding,
    headerRowIndex: detection.headerIndex,
    columnMappings,
    filterRules,
    importCount: 0,
    lastUsedAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const { rows: preview, warnings } = previewParse(data, detection.headerIndex, tempTemplate, 5)

  // 12. 推断 buildClassifyTextFrom
  const buildClassifyTextFrom = inferClassifyTextColumns(columnMappings)

  // 13. 建议名称
  const suggestedName = suggestTemplateName(detection.headers, file.name)

  return {
    grid: data,
    fileType,
    encoding,
    fingerprint,
    headers: detection.headers,
    rawHeaders: detection.rawHeaders,
    columnTypes,
    columnRoles: roles,
    columnMappings,
    filterRules,
    preview,
    warnings,
    suggestedName,
    buildClassifyTextFrom,
  }
}

/**
 * 将用户确认的学习上下文转换为 BillTemplate
 */
export function contextToTemplate(
  ctx: LearningContext,
  name: string,
): Omit<BillTemplate, 'id'> {
  return {
    fingerprint: ctx.fingerprint.headerHash,
    name,
    source: `custom_${name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').toLowerCase()}`,
    isBuiltIn: false,
    fileType: ctx.fileType,
    encoding: ctx.encoding,
    headerRowIndex: ctx.fingerprint.headerRowIndex,
    columnMappings: ctx.columnMappings,
    filterRules: ctx.filterRules,
    buildClassifyTextFrom: ctx.buildClassifyTextFrom,
    importCount: 0,
    lastUsedAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ── 内部工具函数 ──

function generateColumnMappings(
  headers: string[],
  rawHeaders: string[],
  roles: (ColumnRole | null)[],
  types: ColumnType[],
  sampleRows: string[][],
): ColumnMapping[] {
  const mappings: ColumnMapping[] = []

  for (let i = 0; i < headers.length; i++) {
    const role = roles[i] || 'skip'
    const mapping: ColumnMapping = {
      columnIndex: i,
      originalHeader: rawHeaders[i] || '',
      normalizedHeader: headers[i] || '',
      role,
      inferredType: types[i],
    }

    // 根据角色和样本数据推断 transform
    if (role === 'date') {
      mapping.transform = inferDateTransform(sampleRows, i)
    } else if (role === 'amount') {
      const transform = inferAmountTransform(sampleRows, i)
      if (transform) mapping.transform = transform
    } else if (role === 'direction') {
      const transform = inferDirectionTransform(sampleRows, i)
      if (transform) mapping.transform = transform
    } else if (role === 'note' || role === 'counterparty') {
      const cleanPrefixes = inferCleanPrefixes(sampleRows, i)
      if (cleanPrefixes.length > 0) {
        mapping.transform = { cleanPrefixes }
      }
    }

    mappings.push(mapping)
  }

  return mappings
}

function inferDateTransform(sampleRows: string[][], col: number): { dateFormat: string } | undefined {
  for (const row of sampleRows.slice(0, 10)) {
    const val = row[col]
    if (!val) continue
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(val)) return { dateFormat: 'YYYY-MM-DD HH:mm:ss' }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(val)) return { dateFormat: 'YYYY-MM-DD HH:mm' }
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return { dateFormat: 'YYYY-MM-DD' }
    if (/^\d{4}\/\d{2}\/\d{2}/.test(val)) return { dateFormat: 'YYYY/MM/DD' }
  }
  return undefined
}

function inferAmountTransform(sampleRows: string[][], col: number): ColumnMapping['transform'] | undefined {
  const values = sampleRows.slice(0, 20).map(r => r[col]).filter(Boolean)
  if (values.length === 0) return undefined

  const hasCurrencySymbol = values.some(v => /[¥￥$€£]/.test(v))
  const hasComma = values.some(v => /,\d{3}/.test(v))
  const hasSign = values.some(v => /^[+-]\d/.test(v))

  const stripChars = (hasCurrencySymbol ? '¥￥$€£' : '') + (hasComma ? ',' : '')

  const transform: NonNullable<ColumnMapping['transform']> = {}
  if (stripChars) transform.amountStripChars = stripChars
  if (hasSign) transform.signedAmount = true

  return Object.keys(transform).length > 0 ? transform : undefined
}

function inferDirectionTransform(sampleRows: string[][], col: number): ColumnMapping['transform'] | undefined {
  const uniqueValues = new Set<string>()
  for (const row of sampleRows.slice(0, 30)) {
    const val = row[col]?.trim()
    if (val) uniqueValues.add(val)
  }

  const vals = [...uniqueValues]
  const incomeValues = vals.filter(v => v === '收入' || v === '借' || v.toLowerCase() === 'credit')
  const expenseValues = vals.filter(v => v === '支出' || v === '贷' || v.toLowerCase() === 'debit')

  if (incomeValues.length > 0 || expenseValues.length > 0) {
    const directionMap: Record<string, 'income' | 'expense'> = {}
    for (const v of incomeValues) directionMap[v] = 'income'
    for (const v of expenseValues) directionMap[v] = 'expense'
    return { directionMap }
  }

  return undefined
}

function inferCleanPrefixes(sampleRows: string[][], col: number): string[] {
  const prefixes: string[] = []
  const values = sampleRows.slice(0, 30).map(r => r[col]).filter(v => v && v !== '/')

  // 检测常见支付渠道前缀
  const patterns = [
    /^(财付通\([^)]+\)-)/,
    /^(财付通（[^）]+）-)/,
    /^(支付宝[（(][^）)]+[）)]-)/,
    /^(支付宝支付科技有限公司-)/,
    /^(财付通支付科技有限公司-)/,
  ]

  for (const pattern of patterns) {
    const matchCount = values.filter(v => pattern.test(v)).length
    if (matchCount >= 2) {
      prefixes.push(pattern.source)
    }
  }

  return prefixes
}

function generateFilterRules(mappings: ColumnMapping[], sampleRows: string[][]): FilterRule[] {
  const rules: FilterRule[] = []

  // direction 列：检查 "/" 和 "不计收支"
  const dirMapping = mappings.find(m => m.role === 'direction')
  if (dirMapping) {
    const values = sampleRows.map(r => r[dirMapping.columnIndex] || '')
    if (values.some(v => v === '/')) {
      rules.push({ type: 'column_equals', columnIndex: dirMapping.columnIndex, value: '/', action: 'skip', reason: 'internal_transfer' })
    }
    if (values.some(v => v === '不计收支')) {
      rules.push({ type: 'column_equals', columnIndex: dirMapping.columnIndex, value: '不计收支', action: 'skip', reason: 'internal_transfer' })
    }
  }

  // status 列：检查 "交易关闭"/"失败"
  const statusMapping = mappings.find(m => m.role === 'status')
  if (statusMapping) {
    const values = sampleRows.map(r => r[statusMapping.columnIndex] || '')
    if (values.some(v => v === '交易关闭')) {
      rules.push({ type: 'column_equals', columnIndex: statusMapping.columnIndex, value: '交易关闭', action: 'skip', reason: 'closed' })
    }
    if (values.some(v => v.includes('失败'))) {
      rules.push({ type: 'column_contains', columnIndex: statusMapping.columnIndex, value: '失败', action: 'skip', reason: 'failed' })
    }
  }

  // note 列：检查 "退款-" 前缀
  const noteMapping = mappings.find(m => m.role === 'note')
  if (noteMapping) {
    const values = sampleRows.map(r => r[noteMapping.columnIndex] || '')
    if (values.some(v => v.startsWith('退款-'))) {
      rules.push({ type: 'column_contains', columnIndex: noteMapping.columnIndex, value: '退款-', action: 'skip', reason: 'refund' })
    }
  }

  return rules
}

function inferClassifyTextColumns(mappings: ColumnMapping[]): number[] {
  const indices: number[] = []

  // 优先用 note + counterparty
  const noteMapping = mappings.find(m => m.role === 'note')
  if (noteMapping) indices.push(noteMapping.columnIndex)

  const cpMapping = mappings.find(m => m.role === 'counterparty')
  if (cpMapping && cpMapping.columnIndex !== noteMapping?.columnIndex) {
    indices.push(cpMapping.columnIndex)
  }

  return indices
}

function suggestTemplateName(headers: string[], fileName: string): string {
  // 从文件名推断
  const name = fileName.replace(/\.[^.]+$/, '')
  if (name.includes('银行') || name.includes('账单') || name.includes('交易')) {
    return name
  }
  // 从表头推断
  const headerText = headers.filter(Boolean).slice(0, 3).join('-')
  return `自定义账单 (${headerText.slice(0, 20)})`
}
