import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import { createBackup, listBackups, deleteBackup, restoreBackup, setAutoBackupEnabled } from './backup'

const BACKUP_TABLES = [
  'transactions', 'budgets', 'settings', 'categories',
  'billTemplates', 'aiSuggestions', 'dedupStrategies', 'dedupRecords',
]

describe('backup', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.budgets.clear()
    await db.settings.clear()
    await db.categories.clear()
    await db.billTemplates.clear()
    await db.aiSuggestions.clear()
    await db.dedupStrategies.clear()
    await db.dedupRecords.clear()
    await db.backups.clear()
    await db.categories.bulkAdd([
      { id: 'food', name: '餐饮', icon: '🍜', color: '#3b82f6', keywords: ['午餐'], sortOrder: 1, isBuiltIn: true, type: 'expense' },
    ])
    await db.settings.put({ key: 'llm.enabled', value: false })
  })

  it('createBackup 写入 payload,含全部 8 张表', async () => {
    await db.transactions.add({
      amount: 10, category: 'food', date: '2026-08-05', type: 'expense', note: 'a', createdAt: 1, updatedAt: 1,
    })
    const id = await createBackup('manual')
    const rec = await db.backups.get(id)
    expect(rec).toBeDefined()
    expect(rec!.kind).toBe('manual')
    const payload = JSON.parse(rec!.payload) as { version: number; tables: Record<string, unknown[]> }
    expect(payload.version).toBe(1)
    expect(Object.keys(payload.tables).sort()).toEqual([...BACKUP_TABLES].sort())
    expect(payload.tables.transactions).toHaveLength(1)
  })

  it('auto 备份超过 10 份时修剪最旧,只保留 10 份', async () => {
    for (let i = 0; i < 12; i++) {
      await createBackup('auto')
    }
    const autos = await db.backups.where('kind').equals('auto').toArray()
    expect(autos).toHaveLength(10)
  })

  it('manual 备份不受 10 份上限约束', async () => {
    for (let i = 0; i < 12; i++) {
      await createBackup('manual')
    }
    const manuals = await db.backups.where('kind').equals('manual').toArray()
    expect(manuals).toHaveLength(12)
  })

  it('listBackups 按 createdAt 倒序', async () => {
    const now = Date.now()
    await db.backups.bulkAdd([
      { createdAt: now - 1000, kind: 'manual', payload: '{}' },
      { createdAt: now, kind: 'manual', payload: '{}' },
    ])
    const list = await listBackups()
    expect(list[0].createdAt).toBe(now)
  })

  it('deleteBackup 删除指定备份', async () => {
    const id = await createBackup('manual')
    await deleteBackup(id)
    expect(await db.backups.get(id)).toBeUndefined()
  })

  it('restoreBackup 恢复 transactions 数据(restore 自身清库,restore 前写的干扰数据被清除)', async () => {
    // 先写 1 笔待备份数据,创建备份(备份内恰好 1 笔)
    await db.transactions.add({
      amount: 10, category: 'food', date: '2026-08-05', type: 'expense', note: 'a', createdAt: 1, updatedAt: 1,
    })
    const id = await createBackup('manual')
    // 备份后再写 2+1 笔干扰(均不在备份内):restore 若不清库,这些会残留,断言失败
    await db.transactions.bulkAdd([
      { amount: 99, category: 'food', date: '2026-08-01', type: 'expense', note: '干扰1', createdAt: 2, updatedAt: 2 },
      { amount: 88, category: 'food', date: '2026-08-02', type: 'expense', note: '干扰2', createdAt: 3, updatedAt: 3 },
    ])
    await db.transactions.add({
      amount: 77, category: 'food', date: '2026-08-06', type: 'expense', note: '干扰3', createdAt: 4, updatedAt: 4,
    })
    await restoreBackup(id)
    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(10)
  })

  it('restoreBackup 目标不存在时静默返回', async () => {
    await expect(restoreBackup(9999)).resolves.toBeUndefined()
  })

  it('setAutoBackupEnabled 可切换开关且不抛错', () => {
    expect(() => setAutoBackupEnabled(false)).not.toThrow()
    expect(() => setAutoBackupEnabled(true)).not.toThrow()
  })
})
