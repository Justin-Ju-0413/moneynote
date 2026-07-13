// 数据备份：自动/手动快照，防止 IndexedDB 意外丢失
// 自动备份通过对核心表挂 Dexie 钩子 + 防抖实现
import { db } from '@/db'
import type { BackupRecord } from '@/db/types'

// 参与备份的表（缓存类 classificationCache/parseCache 可再生，不计入）
const BACKUP_TABLES = [
  'transactions', 'budgets', 'settings', 'categories',
  'billTemplates', 'aiSuggestions', 'dedupStrategies', 'dedupRecords',
] as const

const MAX_AUTO_BACKUPS = 10
const DEBOUNCE_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000

let autoTimer: ReturnType<typeof setTimeout> | null = null
let isRestoring = false
let autoEnabled = true
let initialized = false

export function setAutoBackupEnabled(enabled: boolean): void {
  autoEnabled = enabled
}

interface BackupPayload {
  version: 1
  createdAt: number
  kind: 'auto' | 'manual'
  tables: Record<string, unknown[]>
}

// 请求持久化存储，降低浏览器在存储压力下驱逐 IndexedDB 的概率
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted()
      if (!already) await navigator.storage.persist()
    }
  } catch {
    /* 忽略不支持的环境 */
  }
}

export async function createBackup(kind: 'auto' | 'manual' = 'manual'): Promise<number> {
  const tables: Record<string, unknown[]> = {}
  for (const name of BACKUP_TABLES) {
    tables[name] = await (db as unknown as { table: (n: string) => { toArray: () => Promise<unknown[]> } }).table(name).toArray()
  }
  const createdAt = Date.now()
  const payload: BackupPayload = { version: 1, createdAt, kind, tables }
  const id = await db.backups.add({
    createdAt,
    kind,
    payload: JSON.stringify(payload),
  })
  await pruneBackups()
  return id as number
}

export async function listBackups(): Promise<BackupRecord[]> {
  return db.backups.orderBy('createdAt').reverse().toArray()
}

export async function deleteBackup(id: number): Promise<void> {
  await db.backups.delete(id)
}

async function pruneBackups(): Promise<void> {
  const auto = await db.backups.where('kind').equals('auto').reverse().toArray()
  if (auto.length > MAX_AUTO_BACKUPS) {
    const toDelete = auto.slice(MAX_AUTO_BACKUPS).map((b) => b.id).filter((x): x is number => x !== undefined)
    if (toDelete.length) await db.backups.bulkDelete(toDelete)
  }
}

export async function restoreBackup(id: number): Promise<void> {
  const rec = await db.backups.get(id)
  if (!rec) return
  const payload = JSON.parse(rec.payload) as BackupPayload
  isRestoring = true
  try {
    for (const name of BACKUP_TABLES) {
      const rows = payload.tables[name]
      if (!rows) continue
      const table = (db as unknown as { table: (n: string) => { clear: () => Promise<void>; bulkPut: (r: unknown[]) => Promise<unknown> } }).table(name)
      await table.clear()
      if (rows.length > 0) await table.bulkPut(rows)
    }
  } finally {
    isRestoring = false
  }
}

function scheduleAutoBackup(): void {
  if (!autoEnabled || isRestoring) return
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = setTimeout(() => {
    createBackup('auto').catch(() => {})
    autoTimer = null
  }, DEBOUNCE_MS)
}

// 挂载钩子并补做启动检查：超过一天无自动备份则补一次
export async function initAutoBackup(): Promise<void> {
  if (initialized) return
  initialized = true

  const setting = await db.settings.get('backup.auto')
  autoEnabled = setting?.value !== false

  for (const name of ['transactions', 'budgets'] as const) {
    const table = (db as unknown as { table: (n: string) => { hook: (e: string, fn: () => void) => unknown } }).table(name)
    table.hook('creating', scheduleAutoBackup)
    table.hook('updating', scheduleAutoBackup)
    table.hook('deleting', scheduleAutoBackup)
  }

  const last = await db.backups.where('kind').equals('auto').reverse().first()
  const count = await db.transactions.count()
  if (count > 0 && (!last || Date.now() - last.createdAt > DAY_MS)) {
    createBackup('auto').catch(() => {})
  }
}
