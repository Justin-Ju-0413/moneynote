import type { EntityTable } from 'dexie'
import type { LLMParseResult, AiSuggestion } from '@/llm/types'

export interface Transaction {
  id?: number
  amount: number
  category: string
  date: string // "YYYY-MM-DD"
  time?: string // "HH:mm"
  note?: string
  type: 'expense' | 'income'
  rawInput?: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  keywords: string[]
  sortOrder: number
  isBuiltIn: boolean
  type: 'expense' | 'income'
}

export interface Budget {
  id?: number
  category: string | 'total'
  amount: number
  period: 'monthly'
  createdAt: number
  updatedAt: number
}

export interface Setting {
  key: string
  value: string | number | boolean
}

// LLM 分类缓存
export interface ClassificationCache {
  merchant: string    // 商户/商品描述作为缓存键
  category: string    // 分类结果
  confidence: number  // 置信度
  updatedAt: number   // 更新时间戳
}

// AI 解析结果缓存（自然语言输入场景）
export interface ParseCache {
  cacheKey: string          // 标准化后的缓存键（主键）
  result: LLMParseResult    // 完整的 AI 解析结果
  originalInput: string     // 原始用户输入（用于调试/展示）
  hitCount: number          // 命中次数（用于后续 LRU 淘汰）
  createdAt: number         // 创建时间戳
  updatedAt: number         // 最后命中时间戳
}

// ── 账单模板相关类型 ──

// 列语义角色
export type ColumnRole = 'date' | 'amount' | 'direction' | 'note' | 'counterparty'
                       | 'category' | 'status' | 'balance' | 'skip'

// 列类型推断结果
export type ColumnType = 'string' | 'number' | 'date' | 'datetime' | 'currency'

// 单列映射定义
export interface ColumnMapping {
  columnIndex: number
  originalHeader: string        // 原始表头（如 "交易日期\nDate"）
  normalizedHeader: string      // 标准化后表头（如 "交易日期"）
  role: ColumnRole
  inferredType?: ColumnType
  transform?: {
    dateFormat?: string         // 日期格式模板, 如 "YYYY-MM-DD HH:mm:ss"
    amountStripChars?: string   // 金额需去除的字符, 如 "¥￥,"
    directionMap?: Record<string, 'income' | 'expense'>  // 方向值映射
    signedAmount?: boolean      // 是否用正负号表示方向（平安模式）
    cleanPrefixes?: string[]    // 备注需清洗的前缀正则
  }
}

// 过滤规则
export interface FilterRule {
  type: 'column_equals' | 'column_contains' | 'column_regex'
  columnIndex: number
  value?: string
  action: 'skip'
  reason: string                // 如 'refund', 'internal_transfer', 'interest'
}

// 文件特征指纹
export interface TemplateFingerprint {
  fileType: 'csv' | 'xlsx'
  encoding?: 'gbk' | 'utf-8'
  headerRowIndex: number
  headerHash: string            // 表头排序后的 FNV-1a 哈希
  columnCount: number
  headerTexts: string[]         // 标准化后的表头文本数组
}

// 账单模板
export interface BillTemplate {
  id?: number
  fingerprint: string           // headerHash（冗余索引字段）
  name: string                  // 用户可读名称, 如 "支付宝账单"
  source: string                // 来源标识, 如 "alipay", "custom_cmb"
  isBuiltIn: boolean
  fileType: 'csv' | 'xlsx'
  encoding?: 'gbk' | 'utf-8'
  headerRowIndex: number
  columnMappings: ColumnMapping[]
  filterRules: FilterRule[]
  sourceCategoryMap?: { columnIndex: number; mapping: Record<string, string> }
  buildClassifyTextFrom?: number[]  // 用于构建分类文本的列索引
  importCount: number
  lastUsedAt: number
  createdAt: number
  updatedAt: number
}

// ── 模糊去重相关类型（移植自 finance-app DedupService，适配 MoneyNote Transaction）──

export type DedupTimeWindow = 'SAME_DAY' | 'SAME_WEEK' | 'SAME_MONTH' | 'SAME_QUARTER' | 'SAME_YEAR'
export type DedupAction = 'IGNORE' | 'MERGE_KEEP_A' | 'MERGE_KEEP_B' | 'DELETE_A' | 'DELETE_B'
export type DedupStatus = 'PENDING' | 'IGNORED' | 'MERGED' | 'DELETED'

// 去重匹配字段（MoneyNote Transaction 可用字段）
export type DedupMatchField = 'amount' | 'date' | 'note'

export interface DedupStrategy {
  id: string
  name: string
  matchFields: DedupMatchField[]
  similarityThreshold: number
  timeWindow: DedupTimeWindow | null
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface DedupRecord {
  id?: number
  entryAId: number
  entryBId: number
  similarity: number
  status: DedupStatus
  action: DedupAction | null
  detectTime: number
  handleTime?: number
}

// ── 数据备份（防 IndexedDB 意外丢失）──
export interface BackupRecord {
  id?: number
  createdAt: number
  kind: 'auto' | 'manual'
  payload: string // 序列化的各表快照 JSON
}

// ── AI 审计结果缓存（按 task + 流水签名命中，避免重复调 API）──
export interface AuditCache {
  id?: number
  cacheKey: string
  task: string
  suggestions: string // 序列化的 AiSuggestion[]
  txCount: number
  createdAt: number
}

export interface AppDBSchema {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'id'>
  budgets: EntityTable<Budget, 'id'>
  settings: EntityTable<Setting, 'key'>
  classificationCache: EntityTable<ClassificationCache, 'merchant'>
  parseCache: EntityTable<ParseCache, 'cacheKey'>
  billTemplates: EntityTable<BillTemplate, 'id'>
  aiSuggestions: EntityTable<AiSuggestion, 'id'>
  dedupStrategies: EntityTable<DedupStrategy, 'id'>
  dedupRecords: EntityTable<DedupRecord, 'id'>
  backups: EntityTable<BackupRecord, 'id'>
  auditCache: EntityTable<AuditCache, 'cacheKey'>
}

// NLP 解析结果
export interface ParsedTransaction {
  amount: number | null
  amountConfidence: 'high' | 'medium' | 'low'
  category: string
  categoryConfidence: 'high' | 'medium' | 'low'
  date: string
  time: string | null
  note: string
  rawInput: string
  type: 'expense' | 'income'
  needsReview: boolean
}
