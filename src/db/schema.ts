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
  }
}
