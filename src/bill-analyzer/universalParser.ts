import type { BillTemplate, ColumnMapping, FilterRule } from '@/db/types'
import type { RawBillRow } from '@/utils/import'
import * as log from '@/utils/log'
import { parseCSVLine } from '@/utils/csv'

export interface ParseResult {
  source: string
  rows: RawBillRow[]
  totalRows: number
  templateId?: number
  diagnostics?: { totalScanned: number; skippedRows: number; reasons: Record<string, number> }
}

// ── 模板驱动的通用解析引擎 ──

export async function parseWithTemplate(
  file: File,
  template: BillTemplate,
): Promise<ParseResult> {
  const data = await readFileAsGrid(file, template)

  if (!data || data.length === 0) {
    throw new Error('文件为空')
  }

  // 定位表头行：以 template.headerRowIndex 为基准，上下浮动 3 行验证
  const headerIndex = locateHeaderRow(data, template)
  if (headerIndex === -1) {
    throw new Error(`无法在 ${template.name} 中定位表头行`)
  }

  // 构建 header → ColumnMapping 查找表
  const actualHeaders = (data[headerIndex] || []).map(c => {
    const full = String(c ?? '').trim()
    const nl = full.indexOf('\n')
    return nl > 0 ? full.slice(0, nl).trim() : full
  })
  const headerToIndex = new Map<string, number>()
  actualHeaders.forEach((h, i) => { if (h) headerToIndex.set(h, i) })
  const alignedMappings = template.columnMappings.map(m => {
    const idx = headerToIndex.get(m.normalizedHeader)
    return idx !== undefined ? { ...m, columnIndex: idx } : m
  })
  const origIdxToHeader = new Map<number, string>()
  for (const m of template.columnMappings) origIdxToHeader.set(m.columnIndex, m.normalizedHeader)
  const alignedFilters = template.filterRules.map(r => {
    const hdr = origIdxToHeader.get(r.columnIndex)
    const idx = hdr ? headerToIndex.get(hdr) : undefined
    return idx !== undefined ? { ...r, columnIndex: idx } : r
  })

  const mappingByHeader = new Map<string, ColumnMapping>()
  for (const m of alignedMappings) {
    mappingByHeader.set(m.normalizedHeader, m)
  }

  // 找关键角色列
  const dateMapping = alignedMappings.find(m => m.role === 'date')
  const amountMapping = alignedMappings.find(m => m.role === 'amount')
  const directionMapping = alignedMappings.find(m => m.role === 'direction')

  if (!dateMapping || !amountMapping) {
    throw new Error('模板缺少 date 或 amount 列映射')
  }

  const rows: RawBillRow[] = []
  const reasons: Record<string, number> = {}
  let totalScanned = 0
  let skippedRows = 0

  const trackSkip = (reason: string) => {
    skippedRows++
    reasons[reason] = (reasons[reason] || 0) + 1
  }

  for (let i = headerIndex + 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData || rowData.length < 2) continue
    totalScanned++

    // 提取原始单元格值
    const cellValues: string[] = []
    for (let col = 0; col < rowData.length; col++) {
      const cell = rowData[col]
      if (cell instanceof Date) {
        cellValues.push(formatDate(cell, dateMapping.transform?.dateFormat))
      } else {
        cellValues.push(String(cell ?? '').trim())
      }
    }

    // 应用过滤规则
    const skipReason = applyFilterRules(cellValues, alignedFilters)
    if (skipReason) { trackSkip(`filter:${skipReason}`); continue }

    // 解析金额
    const rawAmount = cellValues[amountMapping.columnIndex] || ''
    const amountNum = parseAmount(rawAmount, amountMapping.transform)
    if (isNaN(amountNum) || amountNum === 0) { trackSkip('invalid_amount'); continue }

    // 解析日期
    const rawDate = cellValues[dateMapping.columnIndex] || ''
    const dateStr = normalizeDate(rawDate, dateMapping.transform?.dateFormat)
    if (!dateStr) { trackSkip('invalid_date'); continue }

    // 解析方向
    let direction: 'income' | 'expense' = 'expense'
    if (directionMapping) {
      const dirValue = cellValues[directionMapping.columnIndex] || ''
      direction = resolveDirection(dirValue, directionMapping.transform)
    } else if (amountMapping.transform?.signedAmount) {
      direction = amountNum < 0 ? 'expense' : 'income'
    }

    // 构建标准化字段
    const fields: Record<string, string> = {
      '交易时间': dateStr,
      '金额': String(Math.abs(amountNum)),
      '收/支': direction === 'income' ? '收入' : '支出',
    }

    // 添加所有列的原始值（按 normalizedHeader）
    for (const m of alignedMappings) {
      if (m.role === 'skip') continue
      const val = cellValues[m.columnIndex] || ''
      // 应用 transform 清洗
      if (m.transform?.cleanPrefixes && val && val !== '/') {
        fields[m.normalizedHeader] = applyCleanPrefixes(val, m.transform.cleanPrefixes)
      } else {
        fields[m.normalizedHeader] = val
      }
    }

    // 兼容字段映射（确保下游 billClassifier 能正常工作）
    if (!fields['商品说明'] && !fields['商品']) {
      const noteMapping = alignedMappings.find(m => m.role === 'note')
      if (noteMapping) {
        fields['商品说明'] = cellValues[noteMapping.columnIndex] || ''
      }
    }
    if (!fields['交易对方']) {
      const cpMapping = alignedMappings.find(m => m.role === 'counterparty')
      if (cpMapping) {
        fields['交易对方'] = cellValues[cpMapping.columnIndex] || ''
      }
    }

    rows.push({ source: template.source as 'alipay' | 'wechat' | 'pingan', fields })
  }

  return {
    source: template.source,
    rows,
    totalRows: rows.length,
    templateId: template.id,
    diagnostics: { totalScanned, skippedRows, reasons },
  }
}

// ── 试解析（预览用） ──

export function previewParse(
  data: (string | number | Date)[][],
  headerIndex: number,
  template: BillTemplate,
  rowCount = 5,
): { rows: RawBillRow[]; warnings: string[] } {
  const warnings: string[] = []
  const rows: RawBillRow[] = []

  const dateMapping = template.columnMappings.find(m => m.role === 'date')
  const amountMapping = template.columnMappings.find(m => m.role === 'amount')
  if (!dateMapping || !amountMapping) {
    warnings.push('模板缺少 date 或 amount 列映射')
    return { rows, warnings }
  }

  const endRow = Math.min(headerIndex + 1 + rowCount, data.length)

  for (let i = headerIndex + 1; i < endRow; i++) {
    const rowData = data[i]
    if (!rowData) continue

    const cellValues: string[] = []
    for (let col = 0; col < rowData.length; col++) {
      const cell = rowData[col]
      if (cell instanceof Date) {
        cellValues.push(formatDate(cell, dateMapping.transform?.dateFormat))
      } else {
        cellValues.push(String(cell ?? '').trim())
      }
    }

    const skipReason = applyFilterRules(cellValues, template.filterRules)
    if (skipReason) {
      warnings.push(`第 ${i - headerIndex} 行被过滤: ${skipReason}`)
      continue
    }

    const rawAmount = cellValues[amountMapping.columnIndex] || ''
    const amountNum = parseAmount(rawAmount, amountMapping.transform)
    if (isNaN(amountNum) || amountNum === 0) {
      warnings.push(`第 ${i - headerIndex} 行金额无效: "${rawAmount}"`)
      continue
    }

    const rawDate = cellValues[dateMapping.columnIndex] || ''
    const dateStr = normalizeDate(rawDate, dateMapping.transform?.dateFormat)
    if (!dateStr) {
      warnings.push(`第 ${i - headerIndex} 行日期无效: "${rawDate}"`)
      continue
    }

    let direction: 'income' | 'expense' = 'expense'
    const directionMapping = template.columnMappings.find(m => m.role === 'direction')
    if (directionMapping) {
      const dirValue = cellValues[directionMapping.columnIndex] || ''
      direction = resolveDirection(dirValue, directionMapping.transform)
    } else if (amountMapping.transform?.signedAmount) {
      direction = amountNum < 0 ? 'expense' : 'income'
    }

    const fields: Record<string, string> = {
      '交易时间': dateStr,
      '金额': String(Math.abs(amountNum)),
      '收/支': direction === 'income' ? '收入' : '支出',
    }

    // 添加备注和交易对方
    const noteMapping = template.columnMappings.find(m => m.role === 'note')
    if (noteMapping) {
      const val = cellValues[noteMapping.columnIndex] || ''
      fields['商品说明'] = noteMapping.transform?.cleanPrefixes ? applyCleanPrefixes(val, noteMapping.transform.cleanPrefixes) : val
    }
    const cpMapping = template.columnMappings.find(m => m.role === 'counterparty')
    if (cpMapping) {
      const val = cellValues[cpMapping.columnIndex] || ''
      fields['交易对方'] = cpMapping.transform?.cleanPrefixes ? applyCleanPrefixes(val, cpMapping.transform.cleanPrefixes) : val
    }

    rows.push({ source: template.source as 'alipay' | 'wechat' | 'pingan', fields })
  }

  return { rows, warnings }
}

// ── 内部工具函数 ──

async function readFileAsGrid(
  file: File,
  template: BillTemplate,
): Promise<(string | number | Date)[][]> {
  if (template.fileType === 'csv') {
    const buffer = await file.arrayBuffer()
    let text: string
    if (template.encoding === 'gbk') {
      try {
        text = new TextDecoder('gbk').decode(buffer)
        if (!text.includes('交易') && !text.includes('金额')) {
          text = new TextDecoder('utf-8').decode(buffer)
        }
      } catch {
        text = new TextDecoder('utf-8').decode(buffer)
      }
    } else {
      text = new TextDecoder('utf-8').decode(buffer)
    }
    if (!text.trim()) return []
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    return lines.map(line => parseCSVLine(line))
  }

  // Excel
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date)[][]
}

function locateHeaderRow(
  data: (string | number | Date)[][],
  template: BillTemplate,
): number {
  // 在 headerRowIndex ± 3 范围内搜索
  const searchStart = Math.max(0, (template.headerRowIndex > 0 ? template.headerRowIndex : 0) - 3)
  const searchEnd = Math.min(data.length, searchStart + 10)

  // 优先用表头关键词匹配
  const headerKeywords = template.columnMappings
    .filter(m => m.role !== 'skip')
    .map(m => m.normalizedHeader)
    .filter(Boolean)

  for (let i = searchStart; i < searchEnd; i++) {
    const row = data[i]
    if (!row) continue
    const cells = row.map(c => {
      const full = String(c ?? '').trim()
      const nlIndex = full.indexOf('\n')
      return nlIndex > 0 ? full.slice(0, nlIndex).trim() : full
    })

    const matchCount = headerKeywords.filter(kw => cells.some(c => c.includes(kw))).length
    if (matchCount >= Math.max(2, headerKeywords.length * 0.5)) {
      return i
    }
  }

  // 回退到模板记录的行号
  if (template.headerRowIndex >= 0 && template.headerRowIndex < data.length) {
    return template.headerRowIndex
  }

  return -1
}

function parseAmount(raw: string, transform?: ColumnMapping['transform']): number {
  const stripChars = transform?.amountStripChars || '¥￥,$€£'
  let cleaned = raw
  for (const ch of stripChars) {
    cleaned = cleaned.split(ch).join('')
  }
  return parseFloat(cleaned)
}

function normalizeDate(raw: string, _dateFormat?: string): string {
  if (!raw) return ''
  // 已是 YYYY-MM-DD 格式（10字符）
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.length > 10 ? raw.slice(0, 10) : raw
  }
  // YYYY/MM/DD 格式
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(raw)) {
    return raw.replace(/\//g, '-').slice(0, 10)
  }
  // 兜底返回原始值（截断到日期部分）
  return raw.slice(0, 10)
}

function formatDate(date: Date, _dateFormat?: string): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  if (hh === '00' && mm === '00' && ss === '00') {
    return `${y}-${m}-${d}`
  }
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function resolveDirection(value: string, transform?: ColumnMapping['transform']): 'income' | 'expense' {
  if (transform?.directionMap) {
    const mapped = transform.directionMap[value]
    if (mapped) return mapped
  }
  // 默认规则
  if (value === '收入' || value === '借') return 'income'
  return 'expense'
}

export function applyFilterRules(cellValues: string[], rules: FilterRule[]): string | null {
  for (const rule of rules) {
    const value = cellValues[rule.columnIndex] || ''
    let match = false

    switch (rule.type) {
      case 'column_equals':
        match = value === rule.value
        break
      case 'column_contains':
        match = rule.value ? value.includes(rule.value) : false
        break
      case 'column_regex':
        if (rule.value) {
          try { match = new RegExp(rule.value).test(value) } catch (err) { log.warn('过滤规则正则无效,已跳过', { pattern: rule.value, err }) }
        }
        break
    }

    if (match && rule.action === 'skip') {
      return rule.reason
    }
  }
  return null
}

function applyCleanPrefixes(value: string, prefixes: string[]): string {
  let result = value
  for (const prefix of prefixes) {
    try {
      result = result.replace(new RegExp(prefix), '')
    } catch (err) { log.warn('清洗前缀正则无效,已跳过', { pattern: prefix, err }) }
  }
  return result
}
