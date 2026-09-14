import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast-context'
import { db } from '@/db'
import type { BackupRecord } from '@/db/types'
import { createBackup, listBackups, restoreBackup, deleteBackup, setAutoBackupEnabled } from '@/utils/backup'

/** 数据备份卡：自动备份开关 + 手动备份 + 备份列表（恢复/删除）。状态自包含 */
export function BackupCard() {
  const { showToast } = useToast()
  const backups = (useLiveQuery(() => listBackups()) ?? []) as BackupRecord[]
  const autoBackupOn = useLiveQuery(() => db.settings.get('backup.auto'))?.value !== false
  const [backupBusy, setBackupBusy] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)

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

  return (
    <Card>
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
