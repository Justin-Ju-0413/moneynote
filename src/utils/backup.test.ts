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

  it('restoreBackup 恢复 transactions 数据(先清空再写回)', async () => {
    await db.transactions.add({
      amount: 10, category: 'food', date: '2026-08-05', type: 'expense', note: 'a', createdAt: 1, updatedAt: 1,
    })
    const id = await createBackup('manual')
    await db.transactions.clear()
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
