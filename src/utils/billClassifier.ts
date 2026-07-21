import type { Transaction, BillTemplate } from '@/db/types'
import type { RawBillRow } from './import'
import { SOURCE_LABELS } from './import'
import type { LLMConfig } from '@/llm/types'
import { matchCategory } from '@/nlp/categoryMatcher'
import { callLLMBatch } from '@/llm/service'
import { db } from '@/db'
import * as log from '@/utils/log'

export type ImportTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

export interface ClassifyResult {
  transactions: ImportTransaction[]
  skippedCount: number
  skipReasons: Record<string, number>
  llmUsedCount: number
  llmFailedCount: number
  cacheHitCount: number
  llmErrorDetail?: string
}

export type ClassifyProgress = {
  phase: 'classifying' | 'llm_batch'
  current: number
  total: number
}

// 支付宝交易分类 → 内部分类映射
const ALIPAY_CATEGORY_MAP: Record<string, string> = {
  '餐饮美食': 'food',
  '交通出行': 'transport',
  '日用百货': 'shopping',
  '服饰装扮': 'shopping',
  '数码电器': 'shopping',
  '美容美发': 'entertainment',
  '运动健身': 'entertainment',
  '休闲娱乐': 'entertainment',
  '文化休闲': 'entertainment',
  '酒店旅游': 'entertainment',
  '住房缴费': 'housing',
  '居家生活': 'housing',
  '医疗健康': 'medical',
  '教育培训': 'education',
  '母婴亲子': 'shopping',
  '商业服务': 'other',
  '信用借还': 'other',
  '转账红包': 'other',
  '充值缴费': 'other',
  '投资理财': 'other',
  '其他': 'other',
}

const BATCH_SIZE = 10
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 天

// ── 缓存辅助函数 ──

async function lookupCache(merchant: string): Promise<{ category: string; confidence: number } | null> {
  try {
    const entry = await db.classificationCache.get(merchant)
    if (entry && Date.now() - entry.updatedAt < CACHE_TTL_MS) {
      return { category: entry.category, confidence: entry.confidence }
    }
  } catch (err) { log.warn('分类缓存读取失败,降级为未命中', err) }
  return null
}

async function writeCache(merchant: string, category: string, confidence: number): Promise<void> {
  try {
    await db.classificationCache.put({ merchant, category, confidence, updatedAt: Date.now() })
  } catch (err) { log.warn('分类缓存写入失败', err) }
}

// ── 主入口：三阶段分类 ──

export async function classifyBillRows(
  rows: RawBillRow[],
  options: { llmEnabled: boolean; llmConfig?: LLMConfig; onProgress?: (p: ClassifyProgress) => void; template?: BillTemplate }
): Promise<ClassifyResult> {
  const transactions: ImportTransaction[] = []
  const skipReasons: Record<string, number> = {}
  let skippedCount = 0
  let llmUsedCount = 0
  let llmFailedCount = 0
  let cacheHitCount = 0
  let llmErrorDetail: string | undefined

  // ── 阶段 1: 本地分类（支付宝映射 + 关键词匹配）──
  // 记录需要 LLM 分类的项：{ index, classifyText }
  const needsLLM: Array<{ index: number; classifyText: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (options.onProgress) {
      options.onProgress({ phase: 'classifying', current: i + 1, total: rows.length })
    }

    // 过滤检查
    const skip = shouldSkipRow(row, options.template)
    if (skip) {
      skippedCount++
      skipReasons[skip] = (skipReasons[skip] || 0) + 1
      continue
    }

    // 字段映射
    const tx = mapRowToTransaction(row, options.template)
    if (!tx) {
      skippedCount++
      skipReasons['invalid'] = (skipReasons['invalid'] || 0) + 1
      continue
    }

    const classifyText = buildClassifyText(row, options.template)

    // 第一级：支付宝交易分类映射（内置模板或模板的 sourceCategoryMap）
    if (row.source === 'alipay') {
      const alipayCat = row.fields['交易分类']
      if (alipayCat && ALIPAY_CATEGORY_MAP[alipayCat]) {
        tx.category = ALIPAY_CATEGORY_MAP[alipayCat]
      }
    } else if (options.template?.sourceCategoryMap) {
      const scm = options.template.sourceCategoryMap
      const catVal = row.fields[scm.columnIndex.toString()] || ''
      if (catVal && scm.mapping[catVal]) {
        tx.category = scm.mapping[catVal]
      }
    }

    // 第二级：关键词匹配
    if (tx.category === 'other') {
      const matchResult = matchCategory(classifyText, tx.type)
      if (matchResult.confidence !== 'low') {
        tx.category = matchResult.category
      } else {
        // 低置信度 → 标记需要 LLM
        needsLLM.push({ index: transactions.length, classifyText })
      }
    }

    transactions.push(tx)
  }

  // ── 阶段 2: 批量 LLM 分类（含缓存查询）──
  if (needsLLM.length > 0 && options.llmEnabled && options.llmConfig) {
    // 2a: 查缓存，将命中的直接应用
    const uncachedItems: Array<{ index: number; classifyText: string }> = []

    for (const item of needsLLM) {
      const cached = await lookupCache(item.classifyText)
      if (cached && cached.confidence >= 0.7) {
        transactions[item.index].category = cached.category
        cacheHitCount++
      } else {
        uncachedItems.push(item)
      }
    }

    // 2b: 未命中缓存的 → 按 BATCH_SIZE 分组批量调用 LLM
    if (uncachedItems.length > 0) {
      if (options.onProgress) {
        options.onProgress({ phase: 'llm_batch', current: 0, total: uncachedItems.length })
      }

      for (let batchStart = 0; batchStart < uncachedItems.length; batchStart += BATCH_SIZE) {
        const batch = uncachedItems.slice(batchStart, batchStart + BATCH_SIZE)
        const texts = batch.map(b => b.classifyText)

        try {
          const batchResult = await callLLMBatch(options.llmConfig!, texts)

          if (batchResult.error) {
            llmErrorDetail = batchResult.error
            llmFailedCount += batch.length
          } else {
            for (let j = 0; j < batch.length; j++) {
              const r = batchResult.results[j]
              if (r && r.confidence >= 0.7) {
                transactions[batch[j].index].category = r.category
                llmUsedCount++
                // 写入缓存
                await writeCache(batch[j].classifyText, r.category, r.confidence)
              } else {
                llmFailedCount++
              }
            }
          }
        } catch {
          llmFailedCount += batch.length
        }

        if (options.onProgress) {
          options.onProgress({
            phase: 'llm_batch',
            current: Math.min(batchStart + BATCH_SIZE, uncachedItems.length),
            total: uncachedItems.length,
          })
        }
      }
    }
  }

  return { transactions, skippedCount, skipReasons, llmUsedCount, llmFailedCount, cacheHitCount, llmErrorDetail }
}

// 过滤规则（有模板时已由 parser 过滤，仅做兜底）
function shouldSkipRow(row: RawBillRow, template?: BillTemplate): string | null {
  // 模板驱动解析已在 parseWithTemplate 中应用 filterRules，这里仅做兜底
  if (template) return null

  if (row.source === 'pingan') return shouldSkipPingAnRow(row)

  const fields = row.fields
  const direction = fields['收/支'] || ''
  const status = fields['当前状态'] || fields['交易状态'] || ''
  const txType = fields['交易类型'] || fields['交易分类'] || ''

  // 内部转账
  if (direction === '/') return 'internal_transfer'
  if (direction === '不计收支') return 'internal_transfer'

  // 交易失败/关闭
  if (status === '交易关闭') return 'closed'
  if (status === '还款失败') return 'failed'

  // 退款
  if (txType.includes('退款')) return 'refund'
  if (fields['商品说明']?.startsWith('退款-') || fields['商品']?.startsWith('退款-')) return 'refund'

  return null
}

// 平安银行过滤规则
function shouldSkipPingAnRow(row: RawBillRow): string | null {
  const summary = row.fields['摘要'] || ''
  const amountStr = row.fields['金额'] || ''
  const amount = parseFloat(amountStr)

  // 退货/退款交易
  if (summary.includes('退货交易')) return 'refund'

  // 基金申购/赎回（非日常消费）
  if (summary.includes('基金支付申购') || summary.includes('基金申购') || summary.includes('基金赎回')) return 'investment'

  // 极小金额利息（通常为几分钱）
  if ((summary.includes('结息') || summary.includes('支付利息')) && !isNaN(amount) && amount < 1) return 'interest'

  return null
}

// 字段映射
function mapRowToTransaction(row: RawBillRow, template?: BillTemplate): ImportTransaction | null {
  const fields = row.fields

  // 日期/时间
  const dateTimeStr = fields['交易时间'] || ''
  const [datePart, timePart] = dateTimeStr.split(' ')
  if (!datePart) return null

  const date = datePart.length === 10 ? datePart : datePart.replace(/\//g, '-')
  const time = timePart ? timePart.slice(0, 5) : undefined

  // 金额
  const rawAmount = fields['金额'] || fields['金额(元)'] || ''
  const amount = parseFloat(rawAmount.replace(/[¥￥,]/g, ''))
  if (isNaN(amount) || amount <= 0) return null

  // 收支类型
  const direction = fields['收/支'] || ''
  const type: 'expense' | 'income' = direction === '收入' ? 'income' : 'expense'

  // 备注：有模板时按角色列提取，无模板走 fallback 链
  let note: string
  if (template) {
    const noteMapping = template.columnMappings.find(m => m.role === 'note')
    const cpMapping = template.columnMappings.find(m => m.role === 'counterparty')
    const noteVal = noteMapping ? fields[noteMapping.normalizedHeader] || '' : ''
    const cpVal = cpMapping ? fields[cpMapping.normalizedHeader] || '' : ''
    note = noteVal || cpVal || fields['商品说明'] || fields['商品'] || fields['备注'] || fields['交易对方'] || fields['交易对手户名'] || ''
  } else {
    note = fields['商品说明'] || fields['商品'] || fields['备注'] || fields['交易对方'] || fields['交易对手户名'] || ''
  }

  // rawInput
  const sourceName = SOURCE_LABELS[row.source] || row.source
  const rawInput = `${date} ${type === 'expense' ? '支出' : '收入'} ¥${amount} ${note} [${sourceName}]`

  return {
    amount,
    category: 'other',
    date,
    time,
    note: note === '/' ? undefined : note,
    type,
    rawInput,
  }
}

// 构建分类文本（用于 matchCategory 和 LLM）
function buildClassifyText(row: RawBillRow, template?: BillTemplate): string {
  // 有模板时按 buildClassifyTextFrom 指定的列拼接
  if (template?.buildClassifyTextFrom && template.buildClassifyTextFrom.length > 0) {
    const parts: string[] = []
    for (const colIdx of template.buildClassifyTextFrom) {
      const mapping = template.columnMappings.find(m => m.columnIndex === colIdx)
      if (mapping) {
        const val = row.fields[mapping.normalizedHeader] || ''
        if (val && val !== '/') parts.push(val)
      }
    }
    if (parts.length > 0) return parts.join(' ')
  }

  if (row.source === 'pingan') {
    const parts: string[] = []
    const note = row.fields['备注']
    if (note && note !== '/') {
      // 清洗支付渠道前缀，提取纯商户名
      const cleaned = note
        .replace(/^财付通\(银联云闪付\)-/, '')
        .replace(/^支付宝（中国）网络技术有限公司-/, '')
        .replace(/^支付宝\(中国\)网络技术有限公司-/, '')
      parts.push(cleaned)
    }
    const cp = row.fields['交易对手户名']
    if (cp && cp !== '/') parts.push(cp)
    return parts.join(' ').trim()
  }

  const product = row.fields['商品说明'] || row.fields['商品'] || ''
  const counterparty = row.fields['交易对方'] || ''
  return `${product} ${counterparty}`.trim()
}
