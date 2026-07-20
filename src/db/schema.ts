import Dexie from 'dexie'
import type { AppDBSchema } from './types'

export class AppDB extends Dexie {
  transactions!: AppDBSchema['transactions']
  categories!: AppDBSchema['categories']
  budgets!: AppDBSchema['budgets']
  settings!: AppDBSchema['settings']
  classificationCache!: AppDBSchema['classificationCache']
  parseCache!: AppDBSchema['parseCache']
  billTemplates!: AppDBSchema['billTemplates']
  aiSuggestions!: AppDBSchema['aiSuggestions']
  dedupStrategies!: AppDBSchema['dedupStrategies']
  dedupRecords!: AppDBSchema['dedupRecords']
  backups!: AppDBSchema['backups']
  auditCache!: AppDBSchema['auditCache']
  chatMessages!: AppDBSchema['chatMessages']

  constructor() {
    super('MoneyNoteDB')

    this.version(1).stores({
      transactions: '++id, date, category, type, [type+date]',
      categories: 'id, sortOrder',
      budgets: '++id, [category+period]',
      settings: 'key',
    })

    // v2: 账单导入去重复合索引
    this.version(2).stores({
      transactions: '++id, date, category, type, [type+date], [date+amount+note]',
    })

    // v3: LLM 分类结果缓存表
    this.version(3).stores({
      classificationCache: 'merchant',
    })

    // v4: AI 解析结果缓存表（自然语言输入场景）
    this.version(4).stores({
      parseCache: 'cacheKey, updatedAt',
    })

    // v5: 账单格式模板表（自适应学习系统）
    this.version(5).stores({
      billTemplates: '++id, fingerprint, name, source',
    })

    // v6: AI 工作台建议表（移植自 项控）
    this.version(6).stores({
      aiSuggestions: '++id, task, type, status, createdAt',
    })

    // v7: 模糊去重策略与记录表（移植自 finance-app）
    this.version(7).stores({
      dedupStrategies: 'id, isDefault',
      dedupRecords: '++id, status, entryAId, entryBId',
    })

    // v8: 数据备份表（自动/手动快照，防 IndexedDB 意外丢失）
    this.version(8).stores({
      backups: '++id, createdAt, kind',
    })

    // v9: AI 审计结果缓存表
    this.version(9).stores({
      auditCache: 'cacheKey, task, createdAt',
    })

    // v10: billTemplates 增加 importCount 索引
    // 修复 getAllTemplates() 的 orderBy('importCount') 因缺索引抛 DexieError 导致设置页白屏
    this.version(10).stores({
      billTemplates: '++id, fingerprint, name, source, importCount',
    })

    // v11: 聊天记账消息表(首页 ChatGPT 式对话,持久化对话历史)
    this.version(11).stores({
      chatMessages: '++id, createdAt',
    })
  }
}
