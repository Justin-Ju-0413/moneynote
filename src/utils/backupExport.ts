// 备份异地化（D4 前半）：把存于 IndexedDB backups 表的快照导出到本地磁盘，
// 避免浏览器清理站点数据时数据与备份同归于尽。
// 路径选择：File System Access API（showSaveFilePicker）可用时直接写文件；
// Firefox / Safari / Tauri WebView（WKWebView/WebKitGTK 不实现 FSA）自动降级为 <a download> 下载。
import dayjs from 'dayjs'
import { db } from '@/db'
import type { BackupRecord } from '@/db/types'
import { createBackup, listBackups } from './backup'
import { downloadFile } from './export'

export const BACKUP_REMIND_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000
export const LAST_EXPORT_SETTING_KEY = 'backup.lastExportAt'

/** 纯函数：导出文件名 moneynote-backup-YYYYMMDD-HHmm.json（dayjs 本地时区，符合项目日期口径） */
export function generateBackupFilename(at: Date | number = new Date()): string {
  return `moneynote-backup-${dayjs(at).format('YYYYMMDD-HHmm')}.json`
}

/** 纯函数：定期备份提醒判定——存在交易数据，且（从未导出 或 距上次导出严格大于 30 天） */
export function shouldRemindBackupExport(input: {
  lastExportAt: number | undefined
  hasTransactions: boolean
  now: number
}): boolean {
  if (!input.hasTransactions) return false
  if (input.lastExportAt === undefined) return true
  return input.now - input.lastExportAt > BACKUP_REMIND_INTERVAL_MS
}

export type BackupExportStrategy = 'file-picker' | 'download'

/**
 * 纯函数：能力探测结果 → 导出路径。探测结果作为参数注入，便于单测 mock
 * （Tauri WebView / Firefox / Safari 传 false 即走 download 降级，无需特判宿主环境）。
 */
export function chooseExportStrategy(pickerAvailable: boolean): BackupExportStrategy {
  return pickerAvailable ? 'file-picker' : 'download'
}

// —— TS 类型说明 ——
// showSaveFilePicker 不在项目 TS lib 目标内，这里用「局部结构化类型 + as unknown 收窄」
// 而非全局 declare 补充：不污染全局命名空间、不动 tsconfig 的 lib，作用域仅限本模块。
interface FSWritableLike {
  write(data: string): Promise<void>
  close(): Promise<void>
}
interface FSFileHandleLike {
  createWritable(): Promise<FSWritableLike>
}
type ShowSaveFilePickerFn = (options?: { suggestedName?: string }) => Promise<FSFileHandleLike>

/** 能力探测：window.showSaveFilePicker 是否为实现为函数（node/测试环境无 window → false） */
export function supportsSaveFilePicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  )
}

export type BackupExportResult =
  | { status: 'saved'; strategy: BackupExportStrategy }
  | { status: 'cancelled' }

/** 把指定备份写出到磁盘：FSA 优先（用户取消返回 cancelled），FSA 中途失败降级为下载 */
export async function exportBackupToFile(backup: BackupRecord): Promise<BackupExportResult> {
  const filename = generateBackupFilename(backup.createdAt)
  if (chooseExportStrategy(supportsSaveFilePicker()) === 'file-picker') {
    const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker
    if (picker) {
      try {
        const handle = await picker.call(window, { suggestedName: filename })
        const writable = await handle.createWritable()
        await writable.write(backup.payload)
        await writable.close()
        return { status: 'saved', strategy: 'file-picker' }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return { status: 'cancelled' }
        // 其余 FSA 失败（权限被拒/磁盘错误）→ 落到下方下载降级
      }
    }
  }
  downloadFile(backup.payload, filename, 'application/json')
  return { status: 'saved', strategy: 'download' }
}

/** 导出最新备份（无任何备份时先创建一份手动备份），成功后更新 lastBackupExportAt */
export async function exportLatestBackup(): Promise<BackupExportResult> {
  let latest: BackupRecord | undefined = (await listBackups())[0]
  if (!latest) {
    const id = await createBackup('manual')
    latest = await db.backups.get(id)
  }
  if (!latest) return { status: 'cancelled' }
  const result = await exportBackupToFile(latest)
  if (result.status === 'saved') await markBackupExported()
  return result
}

/** 记录导出时间；同时充当「忽略 30 天」的 snooze 语义（写入 now 即 30 天内不再提醒） */
export async function markBackupExported(at: number = Date.now()): Promise<void> {
  await db.settings.put({ key: LAST_EXPORT_SETTING_KEY, value: at })
}

export async function getLastBackupExportAt(): Promise<number | undefined> {
  const setting = await db.settings.get(LAST_EXPORT_SETTING_KEY)
  return typeof setting?.value === 'number' ? setting.value : undefined
}
