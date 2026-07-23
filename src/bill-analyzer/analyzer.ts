import type { ColumnRole, ColumnType, TemplateFingerprint } from '@/db/types'
import { BUILTIN_DETECTION } from './builtinTemplates'
import { parseCSVLine } from '@/utils/csv'

// ── 表头行检测结果 ──
export interface HeaderDetection {
  headerIndex: number
  headers: string[]             // 标准化后的表头（双语 → 取中文部分）
  rawHeaders: string[]          // 原始表头文本
  confidence: number            // 0-1
  detectedSource?: string       // 匹配到的内置模板 source
}

// ── 表头关键词集合（用于评分）──
const BILL_HEADER_KEYWORDS = [
  '交易时间', '交易日期', '日期',
  '金额', '交易金额', '金额(元)',
  '收/支', '收支', '借贷',
  '摘要', '备注', '商品说明', '商品', '交易描述',
  '交易对方', '交易对手户名', '对方户名', '商户名称',
  '交易分类', '分类',
  '当前状态', '交易状态',
  '余额',
  '交易类型',
  '序号',
]

// ── 列角色推断关键词映射 ──
const ROLE_KEYWORDS: Record<ColumnRole, string[]> = {
  date: ['交易时间', '交易日期', '日期', 'date', 'transaction date', '记账日期'],
  amount: ['金额', '交易金额', '金额(元)', 'amount', 'transaction amount', '借方金额', '贷方金额'],
  direction: ['收/支', '收支', '借贷', 'type', '收付类型'],
  note: ['商品说明', '商品', '备注', '摘要', '交易描述', 'description', 'memo', 'remark', 'notes'],
  counterparty: ['交易对方', '交易对手户名', '对方户名', 'counterparty', 'name of the other party'],
  category: ['交易分类', '分类', 'category'],
  status: ['当前状态', '交易状态', 'status'],
  balance: ['余额', 'balance'],
  skip: ['序号', 'no.', 'no'],
}

// ── 1. 表头行定位 ──

export function detectHeaderRow(
  data: (string | number | Date)[][],
  fileType: 'csv' | 'xlsx',
): HeaderDetection {
  const scanLimit = Math.min(25, data.length)
  let bestIndex = -1
  let bestScore = 0
  let bestHeaders: string[] = []
  let bestRawHeaders: string[] = []

  for (let i = 0; i < scanLimit; i++) {
    const row = data[i]
    if (!row || row.length < 2) continue

    // 标准化表头（双语表头: "交易日期\nDate" → "交易日期"）
    const rawCells = row.map(c => String(c ?? '').trim())
    const normalized = rawCells.map(normalizeHeader)

    // 评分：匹配到的关键词数 / 总关键词数 × 非空列数
    let score = 0
    for (const cell of normalized) {
      if (!cell) continue
      const lower = cell.toLowerCase()
      for (const kw of BILL_HEADER_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) {
          score += 10 + kw.length
          break
        }
      }
    }

    // 结构特征：该行全为短文本（<30字符），且下一行开始出现数字/日期
    const allShort = normalized.every(c => !c || c.length < 40)
    if (allShort && i + 1 < data.length) {
      const nextRow = data[i + 1]
      if (nextRow) {
        const hasNumericOrDate = nextRow.some(c => {
          if (c instanceof Date) return true
          if (typeof c === 'number') return true
          const s = String(c ?? '').trim()
          return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /^-?\+?\d/.test(s)
        })
        if (hasNumericOrDate) score += 20
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
      bestHeaders = normalized
      bestRawHeaders = rawCells
    }
  }

  if (bestIndex === -1) {
    throw new Error('无法定位表头行，请确认文件格式正确')
  }

  // 检测是否匹配内置模板
  const detectedSource = detectBuiltinSource(bestHeaders, fileType)
  const confidence = Math.min(1, bestScore / 80)

  return {
    headerIndex: bestIndex,
    headers: bestHeaders,
    rawHeaders: bestRawHeaders,
    confidence,
    detectedSource,
  }
}

// ── 2. 内置模板来源检测 ──

function detectBuiltinSource(headers: string[], fileType: 'csv' | 'xlsx'): string | undefined {
  for (const [source, { keywords, matchAll }] of Object.entries(BUILTIN_DETECTION)) {
    // 文件类型过滤
    if (source === 'alipay' && fileType !== 'csv') continue
    if ((source === 'wechat' || source === 'pingan') && fileType !== 'xlsx') continue

    const matches = keywords.map(kw => headers.some(h => h.includes(kw)))
    if (matchAll ? matches.every(Boolean) : matches.some(Boolean)) {
      return source
    }
  }
  return undefined
}

// ── 3. 列类型推断 ──

export function inferColumnTypes(
  data: (string | number | Date)[][],
  headerIndex: number,
  sampleSize = 30,
): ColumnType[] {
  const colCount = data[headerIndex]?.length || 0
  const types: ColumnType[] = new Array(colCount).fill('string')
  const startRow = headerIndex + 1
  const endRow = Math.min(startRow + sampleSize, data.length)

  for (let col = 0; col < colCount; col++) {
    const samples: string[] = []
    let dateObjCount = 0
    let numberCount = 0

    for (let row = startRow; row < endRow; row++) {
      const cell = data[row]?.[col]
      if (cell == null || String(cell).trim() === '') continue

      if (cell instanceof Date) {
        dateObjCount++
        continue
      }
      if (typeof cell === 'number') {
        numberCount++
        continue
      }

      samples.push(String(cell).trim())
    }

    const totalSamples = samples.length + dateObjCount + numberCount
    if (totalSamples === 0) continue

    // Date 对象占比高 → datetime 或 date
    if (dateObjCount > totalSamples * 0.5) {
      types[col] = 'datetime'
      continue
    }

    // 纯数字占比高
    if (numberCount > totalSamples * 0.5) {
      types[col] = 'number'
      continue
    }

    // 字符串模式分析
    let dateCount = 0
    let datetimeCount = 0
    let currencyCount = 0
    let numericCount = 0

    for (const s of samples) {
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/.test(s)) datetimeCount++
      else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) dateCount++
      else if (/^[¥￥$€£]?[\d,]+\.?\d*$/.test(s) && /\d/.test(s)) {
        if (/[¥￥$€£,]/.test(s)) currencyCount++
        else numericCount++
      } else if (/^[+-]\d/.test(s)) numericCount++
    }

    if (datetimeCount > samples.length * 0.5) types[col] = 'datetime'
    else if (dateCount > samples.length * 0.5) types[col] = 'date'
    else if (currencyCount > samples.length * 0.3) types[col] = 'currency'
    else if (numericCount > samples.length * 0.5) types[col] = 'number'
    // 含正负号的数字列也是 number
    else if (samples.some(s => /^[+-]?\d+\.?\d*$/.test(s))) {
      const numRatio = samples.filter(s => /^[+-]?\d+\.?\d*$/.test(s)).length / samples.length
      if (numRatio > 0.5) types[col] = 'number'
    }
  }

  return types
}

// ── 4. 列角色推断 ──

export function inferColumnRoles(
  headers: string[],
  _types: ColumnType[],
  sampleRows?: string[][],
): (ColumnRole | null)[] {
  const roles: (ColumnRole | null)[] = headers.map(() => null)
  const assigned = new Set<number>()

  // 第一轮：高置信度匹配（表头关键词精确包含）
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [ColumnRole, string[]][]) {
    for (let i = 0; i < headers.length; i++) {
      if (assigned.has(i)) continue
      const lower = headers[i].toLowerCase()
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          roles[i] = role
          assigned.add(i)
          break
        }
      }
    }
  }

  // 第二轮：对 date 和 amount 这两个必需角色，放宽匹配
  if (!roles.includes('date')) {
    for (let i = 0; i < headers.length; i++) {
      if (assigned.has(i)) continue
      const h = headers[i].toLowerCase()
      if (h.includes('日期') || h.includes('时间') || h.includes('date') || h.includes('time')) {
        roles[i] = 'date'
        assigned.add(i)
        break
      }
    }
  }

  if (!roles.includes('amount')) {
    for (let i = 0; i < headers.length; i++) {
      if (assigned.has(i)) continue
      const h = headers[i].toLowerCase()
      if (h.includes('金额') || h.includes('amount') || h.includes('借方') || h.includes('贷方')) {
        roles[i] = 'amount'
        assigned.add(i)
        break
      }
    }
  }

  // 第三轮：direction 列可通过值域推断
  if (!roles.includes('direction') && sampleRows) {
    for (let i = 0; i < headers.length; i++) {
      if (assigned.has(i)) continue
      const values = sampleRows.map(r => r[i] || '').filter(Boolean)
      const uniqueValues = new Set(values)
      // 值域恰好为 {收入, 支出} 或 {借, 贷} 等
      if (uniqueValues.size >= 2 && uniqueValues.size <= 4) {
        const vals = [...uniqueValues]
        const hasIncome = vals.some(v => v.includes('收入') || v === '借')
        const hasExpense = vals.some(v => v.includes('支出') || v === '贷')
        if (hasIncome && hasExpense) {
          roles[i] = 'direction'
          assigned.add(i)
          break
        }
      }
    }
  }

  // 未分配的列标记为 skip
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === null) roles[i] = 'skip'
  }

  return roles
}

// ── 5. 指纹生成 ──

export function generateFingerprint(
  fileType: 'csv' | 'xlsx',
  encoding: 'gbk' | 'utf-8' | undefined,
  headerIndex: number,
  headers: string[],
): TemplateFingerprint {
  const hash = fnv1aHash(headers.filter(Boolean).sort().join('|'))
  return {
    fileType,
    encoding,
    headerRowIndex: headerIndex,
    headerHash: hash,
    columnCount: headers.length,
    headerTexts: headers,
  }
}

// ── 6. 解析文件为二维数组 ──

export async function parseFileToGrid(
  file: File,
): Promise<{ data: (string | number | Date)[][]; fileType: 'csv' | 'xlsx'; encoding?: 'gbk' | 'utf-8' }> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.csv')) {
    return parseCSVToGrid(file)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcelToGrid(file)
  }

  throw new Error('不支持的文件格式，请导入 .csv 或 .xlsx 文件')
}

async function parseExcelToGrid(
  file: File,
): Promise<{ data: (string | number | Date)[][]; fileType: 'xlsx' }> {
  const XLSX = await import('@e965/xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date)[][]
  return { data, fileType: 'xlsx' }
}

async function parseCSVToGrid(
  file: File,
): Promise<{ data: (string | number | Date)[][]; fileType: 'csv'; encoding: 'gbk' | 'utf-8' }> {
  const buffer = await file.arrayBuffer()

  // 尝试 GBK 解码
  let text: string
  let encoding: 'gbk' | 'utf-8' = 'gbk'
  try {
    text = new TextDecoder('gbk').decode(buffer)
    if (!text.includes('交易时间') && !text.includes('交易日期')) {
      text = new TextDecoder('utf-8').decode(buffer)
      encoding = 'utf-8'
    }
  } catch {
    text = new TextDecoder('utf-8').decode(buffer)
    encoding = 'utf-8'
  }

  if (!text.trim()) {
    throw new Error('文件为空')
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim())
  const data: string[][] = lines.map(line => parseCSVLine(line))

  return { data, fileType: 'csv', encoding }
}

// ── 工具函数 ──

/** 标准化表头：双语表头取中文部分 */
export function normalizeHeader(raw: string): string {
  const full = raw.trim()
  const nlIndex = full.indexOf('\n')
  return nlIndex > 0 ? full.slice(0, nlIndex).trim() : full
}

/** FNV-1a 32位哈希 */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
