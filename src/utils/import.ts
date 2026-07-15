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
  matchType?: 'exact' | 'fuzzy' | 'builtin' | 'none'
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

  // 5a. 命中模板 -> 直接用模板解析
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

  // 5b. 未命中 -> 学习流程
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

  // 5c. 无回调或用户取消学习 -> 不再静默走旧解析器兜底,明确报错
  throw new Error('无法识别账单格式,请在列映射确认对话框中完成学习后导入')
}
