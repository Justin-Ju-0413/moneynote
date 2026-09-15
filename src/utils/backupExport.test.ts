import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db'
import {
  generateBackupFilename,
  shouldRemindBackupExport,
  chooseExportStrategy,
  markBackupExported,
  getLastBackupExportAt,
  BACKUP_REMIND_INTERVAL_MS,
  LAST_EXPORT_SETTING_KEY,
} from './backupExport'

const DAY_MS = 24 * 60 * 60 * 1000

// 纯逻辑层测试：文件名生成 / 30 天提醒判定 / 降级路径选择 / lastExportAt 存取，不依赖 DOM
describe('backupExport', () => {
  beforeEach(async () => {
    await db.settings.clear()
  })

  it('generateBackupFilename 生成 moneynote-backup-YYYYMMDD-HHmm.json（本地时区解析与格式化一致）', () => {
    // 无时区后缀的 ISO 串按本地时区解析，dayjs 也按本地格式化，两种 TZ 下结果一致
    expect(generateBackupFilename(new Date('2026-09-15T09:30:00'))).toBe('moneynote-backup-20260915-0930.json')
    // 支持时间戳入参
    expect(generateBackupFilename(new Date('2026-01-05T08:07:00').getTime())).toBe('moneynote-backup-20260105-0807.json')
  })

  it('shouldRemindBackupExport：从未导出时，有交易数据才提醒', () => {
    const now = Date.now()
    expect(shouldRemindBackupExport({ lastExportAt: undefined, hasTransactions: true, now })).toBe(true)
    expect(shouldRemindBackupExport({ lastExportAt: undefined, hasTransactions: false, now })).toBe(false)
  })

  it('shouldRemindBackupExport 边界：29 天/整 30 天不提醒，31 天提醒（严格大于）', () => {
    const now = Date.now()
    const lastExportAt = now - 31 * DAY_MS
    expect(shouldRemindBackupExport({ lastExportAt: now - 29 * DAY_MS, hasTransactions: true, now })).toBe(false)
    expect(shouldRemindBackupExport({ lastExportAt: now - 30 * DAY_MS, hasTransactions: true, now })).toBe(false)
    expect(shouldRemindBackupExport({ lastExportAt, hasTransactions: true, now })).toBe(true)
    expect(BACKUP_REMIND_INTERVAL_MS).toBe(30 * DAY_MS)
  })

  it('shouldRemindBackupExport：最近已导出且有交易时不提醒', () => {
    const now = Date.now()
    expect(shouldRemindBackupExport({ lastExportAt: now - DAY_MS, hasTransactions: true, now })).toBe(false)
    expect(shouldRemindBackupExport({ lastExportAt: now, hasTransactions: true, now })).toBe(false)
  })

  it('chooseExportStrategy：能力探测为 true 走 file-picker，false 走 download 降级', () => {
    expect(chooseExportStrategy(true)).toBe('file-picker')
    expect(chooseExportStrategy(false)).toBe('download')
  })

  it('markBackupExported/getLastBackupExportAt 写读回环，"忽略 30 天" 即写入 now 实现顺延', async () => {
    const at = Date.now() - 5 * DAY_MS
    await markBackupExported(at)
    expect(await getLastBackupExportAt()).toBe(at)
    const setting = await db.settings.get(LAST_EXPORT_SETTING_KEY)
    expect(setting?.key).toBe(LAST_EXPORT_SETTING_KEY)
    // snooze：写入 now 后，30 天内不提醒、31 天再次提醒
    await markBackupExported()
    const snoozed = await getLastBackupExportAt()
    expect(snoozed).toBeGreaterThan(at)
    expect(shouldRemindBackupExport({ lastExportAt: snoozed, hasTransactions: true, now: snoozed! + 30 * DAY_MS })).toBe(false)
    expect(shouldRemindBackupExport({ lastExportAt: snoozed, hasTransactions: true, now: snoozed! + 31 * DAY_MS })).toBe(true)
  })

  it('getLastBackupExportAt：settings 无记录或值非数字时返回 undefined（容错旧值/脏值）', async () => {
    expect(await getLastBackupExportAt()).toBeUndefined()
    await db.settings.put({ key: LAST_EXPORT_SETTING_KEY, value: true })
    expect(await getLastBackupExportAt()).toBeUndefined()
  })
})
