import type { LLMConfig } from '@/llm/types'
import type { BillTemplate } from '@/db/types'
import type { LearningContext } from '@/bill-analyzer/learningFlow'
import { parseFileToGrid, detectHeaderRow, generateFingerprint } from '@/bill-analyzer/analyzer'
import { matchTemplate, updateTemplateUsage } from '@/bill-analyzer/templateMatcher'
import { parseWithTemplate } from '@/bill-analyzer/universalParser'
import { analyzeUnknownFile } from '@/bill-analyzer/learningFlow'

export type BillSource = 'alipay' | 'wechat' | 'pingan'

// 来源名称映射（用于 UI 显示）
export const SOURCE_LABELS: Record<BillSource, string> = {
  alipay: '支付宝',
  wechat: '微信',
  pingan: '平安银行',
}

export interface RawBillRow {
  source: BillSource
  fields: Record<string, string>
}

export interface ParseResult {
  source: BillSource
  rows: RawBillRow[]
  totalRows: number
  templateId?: number
  matchType?: 'exact' | 'fuzzy' | 'builtin' | 'none' | 'legacy'
}

export interface ParseOptions {
  llmConfig?: LLMConfig
  onLearnRequest?: (ctx: LearningContext) => Promise<BillTemplate | null>
}

// ── 解析账单文件（模板驱动编排）──

export async function parseBillFile(file: File, options?: ParseOptions): Promise<ParseResult> {
  // 1. 读取文件为二维网格
  const { data, fileType, encoding } = await parseFileToGrid(file)

  if (!data || data.length === 0) {
    throw new Error('文件为空')
  }

  // 2. 定位表头行
  const detection = detectHeaderRow(data, fileType)

  // 3. 生成指纹
  const fingerprint = generateFingerprint(fileType, encoding, detection.headerIndex, detection.headers)

  // 4. 模板匹配
  const match = await matchTemplate(fingerprint, detection.detectedSource)

  // 5a. 命中模板 → 直接用模板解析
  if (match.template && match.matchType !== 'none') {
    const result = await parseWithTemplate(file, match.template)

    // 更新使用统计
    if (match.template.id) {
      await updateTemplateUsage(match.template)
    }

    return {
      source: result.source as BillSource,
      rows: result.rows,
      totalRows: result.totalRows,
      templateId: match.template.id,
      matchType: match.matchType,
    }
  }

  // 5b. 未命中 → 学习流程
  if (options?.onLearnRequest) {
    const ctx = await analyzeUnknownFile(file, { llmConfig: options.llmConfig })
    const template = await options.onLearnRequest(ctx)

    if (template) {
      const result = await parseWithTemplate(file, template as BillTemplate)
      return {
        source: result.source as BillSource,
        rows: result.rows,
        totalRows: result.totalRows,
        templateId: template.id,
        matchType: 'none',
      }
    }
  }

  // 5c. 无回调或用户取消 → 尝试旧解析器作为 fallback
  return legacyParse(file)
}

// ── 旧解析器 fallback ──

/** @deprecated 仅在模板系统无法匹配时作为兜底 */
async function legacyParse(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.csv')) {
    return legacyParseAlipayCSV(file)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const source = await legacyDetectExcelSource(buffer)
    if (source === 'pingan') {
      return legacyParsePingAnExcel(buffer)
    }
    return legacyParseWeChatExcel(buffer)
  }

  throw new Error('不支持的文件格式，请导入 .csv 或 .xlsx 文件')
}

/** @deprecated */
async function legacyDetectExcelSource(buffer: ArrayBuffer): Promise<'wechat' | 'pingan'> {
  const XLSX = await import('xlsx')
  let data: (string | number | Date)[][]
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date)[][]
  } catch {
    throw new Error('Excel 文件解析失败，请确认文件格式')
  }

  const scanLimit = Math.min(20, data.length)
  for (let i = 0; i < scanLimit; i++) {
    const row = data[i]
    if (!row) continue
    const cells = row.map(c => String(c ?? '').trim())
    if (cells[0] === '交易时间' && cells.includes('收/支')) return 'wechat'
    const hasDate = cells.some(c => c.includes('交易日期'))
    const hasAmount = cells.some(c => c.includes('交易金额'))
    const hasSummary = cells.some(c => c.includes('摘要'))
    if (hasDate && hasAmount && hasSummary) return 'pingan'
  }

  throw new Error('无法识别账单格式，请确认是微信或平安银行的标准账单文件')
}

/** @deprecated */
async function legacyParseAlipayCSV(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()

  let text: string
  try {
    text = new TextDecoder('gbk').decode(buffer)
    if (!text.includes('交易时间')) {
      text = new TextDecoder('utf-8').decode(buffer)
    }
  } catch {
    text = new TextDecoder('utf-8').decode(buffer)
  }

  if (!text.trim()) throw new Error('文件为空')

  const lines = text.split(/\r?\n/).filter(line => line.trim())

  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('交易时间') || lines[i].includes('交易时间,交易分类')) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error('无法识别账单格式，请确认是支付宝的标准账单文件')
  }

  const headers = parseCSVLine(lines[headerIndex])
  const rows: RawBillRow[] = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < 3) continue

    const fields: Record<string, string> = {}
    headers.forEach((h, idx) => {
      fields[h.trim()] = (values[idx] || '').trim()
    })

    if (!fields['收/支']) continue
    rows.push({ source: 'alipay', fields })
  }

  return { source: 'alipay', rows, totalRows: rows.length, matchType: 'legacy' }
}

/** @deprecated */
async function legacyParseWeChatExcel(fileOrBuffer: File | ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer()

  let data: (string | number | Date)[][]
  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date)[][]
  } catch {
    throw new Error('Excel 文件解析失败，请确认文件格式')
  }

  if (!data || data.length === 0) throw new Error('文件为空')

  let headerIndex = -1
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (row && String(row[0]).trim() === '交易时间') {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error('无法识别微信账单格式，请确认是微信的标准账单文件')
  }

  const headers = data[headerIndex].map(h => String(h || '').trim())
  const rows: RawBillRow[] = []

  for (let i = headerIndex + 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData || rowData.length < 3) continue

    const fields: Record<string, string> = {}
    headers.forEach((h, idx) => {
      const cell = rowData[idx]
      if (cell instanceof Date) {
        if (h === '交易时间') {
          const y = cell.getFullYear()
          const m = String(cell.getMonth() + 1).padStart(2, '0')
          const d = String(cell.getDate()).padStart(2, '0')
          const hh = String(cell.getHours()).padStart(2, '0')
          const mm = String(cell.getMinutes()).padStart(2, '0')
          const ss = String(cell.getSeconds()).padStart(2, '0')
          fields[h] = `${y}-${m}-${d} ${hh}:${mm}:${ss}`
        } else {
          fields[h] = cell.toISOString().split('T')[0]
        }
      } else {
        fields[h] = String(cell ?? '').trim()
      }
    })

    if (!fields['收/支']) continue
    rows.push({ source: 'wechat', fields })
  }

  return { source: 'wechat', rows, totalRows: rows.length, matchType: 'legacy' }
}

/** @deprecated */
async function legacyParsePingAnExcel(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  let data: (string | number | Date)[][]
  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date)[][]
  } catch {
    throw new Error('Excel 文件解析失败，请确认文件格式')
  }

  if (!data || data.length === 0) throw new Error('文件为空')

  let headerIndex = -1
  const scanLimit = Math.min(20, data.length)
  for (let i = 0; i < scanLimit; i++) {
    const row = data[i]
    if (!row) continue
    const cells = row.map(c => String(c ?? '').trim())
    const hasDate = cells.some(c => c.includes('交易日期'))
    const hasAmount = cells.some(c => c.includes('交易金额'))
    if (hasDate && hasAmount) { headerIndex = i; break }
  }

  if (headerIndex === -1) {
    throw new Error('无法识别平安银行账单格式，请确认是平安银行的标准交易明细文件')
  }

  const headers = data[headerIndex].map(h => {
    const full = String(h || '').trim()
    const nlIndex = full.indexOf('\n')
    return nlIndex > 0 ? full.slice(0, nlIndex).trim() : full
  })
  const rows: RawBillRow[] = []

  for (let i = headerIndex + 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData || rowData.length < 3) continue

    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => {
      const cell = rowData[idx]
      if (cell instanceof Date) {
        const y = cell.getFullYear()
        const m = String(cell.getMonth() + 1).padStart(2, '0')
        const d = String(cell.getDate()).padStart(2, '0')
        raw[h] = `${y}-${m}-${d}`
      } else {
        raw[h] = String(cell ?? '').trim()
      }
    })

    const rawAmountStr = raw['交易金额'] || ''
    const amountNum = parseFloat(rawAmountStr.replace(/[¥￥,]/g, ''))
    if (isNaN(amountNum) || amountNum === 0) continue

    const fields: Record<string, string> = {
      '交易时间': raw['交易日期'] || '',
      '金额': String(Math.abs(amountNum)),
      '收/支': amountNum < 0 ? '支出' : '收入',
      '备注': raw['备注'] || '',
      '摘要': raw['摘要'] || '',
      '交易对手户名': raw['交易对手户名'] || '',
      '交易对方': raw['交易对手户名'] || '',
      '交易对手行': raw['交易对手行'] || '',
      '余额': raw['余额'] || '',
      '交易地点': raw['交易地点'] || '',
      '序号': raw['序号'] || '',
    }

    rows.push({ source: 'pingan', fields })
  }

  return { source: 'pingan', rows, totalRows: rows.length, matchType: 'legacy' }
}

// ── 工具函数 ──

// 简单 CSV 行解析（处理引号包裹 + 转义双引号）
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
