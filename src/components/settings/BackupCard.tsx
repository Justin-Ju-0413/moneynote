import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast-context'
import { db } from '@/db'
import type { BackupRecord } from '@/db/types'
import { createBackup, listBackups, restoreBackup, deleteBackup, setAutoBackupEnabled } from '@/utils/backup'
import {
  exportBackupToFile, exportLatestBackup, markBackupExported, shouldRemindBackupExport,
  LAST_EXPORT_SETTING_KEY,
} from '@/utils/backupExport'

/** 数据备份卡：自动备份开关 + 手动备份 + 备份导出到本地文件 + 备份列表（恢复/导出/删除）。状态自包含 */
export function BackupCard() {
  const { showToast } = useToast()
  const backups = (useLiveQuery(() => listBackups()) ?? []) as BackupRecord[]
  const autoBackupOn = useLiveQuery(() => db.settings.get('backup.auto'))?.value !== false
  // 提醒判定在查询回调内完成（不在 render 期调用 Date.now，符合 hooks 纯函数规则）
  const remind = useLiveQuery(async () => {
    const [setting, txCount] = await Promise.all([db.settings.get(LAST_EXPORT_SETTING_KEY), db.transactions.count()])
    return shouldRemindBackupExport({
      lastExportAt: typeof setting?.value === 'number' ? setting.value : undefined,
      hasTransactions: txCount > 0,
      now: Date.now(),
    })
  }) ?? false
  const [backupBusy, setBackupBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)

  const notifyExported = (strategy: 'file-picker' | 'download') => {
    showToast(strategy === 'file-picker' ? '备份已导出到所选位置' : '备份文件已开始下载到本地', 'success')
  }

  const handleBackupNow = async () => {
    setBackupBusy(true)
    try {
      await createBackup('manual')
      showToast('已创建备份', 'success')
    } catch {
      showToast('备份失败', 'error')
    }
    setBackupBusy(false)
  }

  const handleToggleAuto = async () => {
    const next = !autoBackupOn
    await db.settings.put({ key: 'backup.auto', value: next })
    setAutoBackupEnabled(next)
    showToast(next ? '已开启自动备份' : '已关闭自动备份', 'info')
  }

  const handleRestore = async () => {
    const b = restoreTarget
    setRestoreTarget(null)
    if (!b) return
    try {
      await restoreBackup(b.id as number)
      showToast('已恢复，刷新页面以生效', 'success')
    } catch {
      showToast('恢复失败', 'error')
    }
  }

  const handleDeleteBackup = async (id: number) => {
    await deleteBackup(id)
    showToast('已删除备份')
  }

  const handleExportLatest = async () => {
    setExportBusy(true)
    try {
      const result = await exportLatestBackup()
      if (result.status === 'saved') notifyExported(result.strategy)
      else showToast('已取消导出', 'info')
    } catch {
      showToast('导出失败', 'error')
    }
    setExportBusy(false)
  }

  const handleExportOne = async (b: BackupRecord) => {
    try {
      const result = await exportBackupToFile(b)
      if (result.status === 'saved') {
        notifyExported(result.strategy)
        await markBackupExported()
      }
    } catch {
      showToast('导出失败', 'error')
    }
  }

  const handleSnoozeReminder = async () => {
    try {
      await markBackupExported() // 写入 now = 30 天内不再提醒
      showToast('已忽略，30 天内不再提醒', 'info')
    } catch {
      showToast('操作失败', 'error')
    }
  }

  return (
    <Card>
      {remind && (
        <div className="mb-4 flex items-start justify-between gap-2 rounded-button border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="text-[11px] leading-4 text-warning">
            已超过 30 天未导出备份文件，建议导出一份到本地磁盘，避免浏览器清理站点数据时连备份一起丢失
          </p>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <button className="text-[11px] font-medium text-warning hover:underline disabled:opacity-40" onClick={handleExportLatest} disabled={exportBusy}>
              导出
            </button>
            <button className="text-[11px] text-text-muted hover:underline" onClick={handleSnoozeReminder}>
              忽略 30 天
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs text-accent font-medium">数据备份</h3>
          <p className="text-[11px] text-text-muted mt-1">自动快照防止数据意外丢失，保留最近 10 份自动备份</p>
        </div>
        <Toggle
          checked={autoBackupOn}
          onChange={handleToggleAuto}
          label="自动备份"
          title="数据变更 60 秒后自动备份"
        />
      </div>

      <div className="flex gap-2 mb-4">
        <Button onClick={handleBackupNow} variant="secondary" className="flex-1" disabled={backupBusy}>
          {backupBusy ? '备份中...' : '立即备份'}
        </Button>
        <Button onClick={handleExportLatest} variant="primary" className="flex-1" disabled={exportBusy}>
          <span className="inline-flex items-center justify-center gap-1.5">
            <Download size={13} />
            {exportBusy ? '导出中...' : '导出最新备份'}
          </span>
        </Button>
      </div>

      {backups.length > 0 ? (
        <div className="space-y-1.5">
          {backups.slice(0, 12).map((b) => (
            <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-button border border-primary-200/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full ${b.kind === 'auto' ? 'bg-primary-400' : 'bg-success'}`} />
                <span className="text-[10px] font-mono text-text truncate">{new Date(b.createdAt).toLocaleString()}</span>
                <span className="text-[10px] text-text-muted">{b.kind === 'auto' ? '自动' : '手动'}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button title="导出到文件" aria-label="导出该备份到文件" className="text-text-muted hover:text-accent transition-colors" onClick={() => handleExportOne(b)}>
                  <Download size={12} />
                </button>
                <button className="text-[11px] text-accent hover:underline" onClick={() => setRestoreTarget(b)}>恢复</button>
                <button className="text-[11px] text-danger hover:underline" onClick={() => handleDeleteBackup(b.id as number)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-text-placeholder">暂无备份，点击「立即备份」创建第一份</p>
      )}

      <ConfirmDialog
        open={!!restoreTarget}
        title="恢复备份"
        message={restoreTarget ? `确认恢复到 ${new Date(restoreTarget.createdAt).toLocaleString()} 的备份？当前数据将被覆盖。` : ''}
        confirmText="恢复"
        danger
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </Card>
  )
}
