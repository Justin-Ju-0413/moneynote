import { AppDB } from './schema'
import { defaultCategories, defaultSettings } from './seed'
import { BUILTIN_TEMPLATES } from '@/bill-analyzer/builtinTemplates'
import type { Transaction } from './types'

const db = new AppDB()

// 首次打开时写入默认数据
db.on('populate', (tx) => {
  tx.table('categories').bulkAdd(defaultCategories)
  tx.table('settings').bulkAdd(defaultSettings)
  tx.table('billTemplates').bulkAdd(BUILTIN_TEMPLATES)
})

// DB 升级后补充内置模板与收入分类（populate 仅在首次创建时触发，升级不会触发）
db.on('ready', async () => {
  try {
    const count = await db.billTemplates.count()
    if (count === 0) {
      await db.billTemplates.bulkAdd(BUILTIN_TEMPLATES)
    }
    // 收入分类为后增内置项，对已存在的库幂等补写（按 salary id 检测）
    const hasSalary = await db.categories.get('salary')
    if (!hasSalary) {
      const incomeCats = defaultCategories.filter((c) => c.type === 'income')
      if (incomeCats.length > 0) await db.categories.bulkAdd(incomeCats)
    }
  } catch { /* 表未就绪时忽略 */ }
})

// 批量导入交易（去重）
export async function bulkImportTransactions(
  transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<{ imported: number; skipped: number }> {
  const now = Date.now()
  let imported = 0
  let skipped = 0

  await db.transaction('rw', db.transactions, async () => {
    for (const t of transactions) {
      const existing = await db.transactions
        .where('[date+amount+note]')
        .equals([t.date, t.amount, t.note || ''])
        .first()

      if (existing) {
        skipped++
        continue
      }

      await db.transactions.add({
        ...t,
        createdAt: now,
        updatedAt: now,
      })
      imported++
    }
  })

  return { imported, skipped }
}

export { db }
export type { Transaction, Category, Budget, Setting, ParsedTransaction, ClassificationCache, ParseCache,
  BillTemplate, ColumnMapping, ColumnRole, ColumnType, FilterRule, TemplateFingerprint,
  DedupStrategy, DedupRecord, DedupTimeWindow, DedupAction, DedupStatus, DedupMatchField,
  BackupRecord, AuditCache, ChatMessage, ChatCard, ChatIntent } from './types'
