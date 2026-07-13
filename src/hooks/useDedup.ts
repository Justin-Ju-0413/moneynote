import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { DedupAction, DedupRecord, Transaction } from '@/db/types'
import { detectDuplicates, DEFAULT_DEDUP_STRATEGY } from '@/utils/dedup'

// 模糊去重审核 hook
export function useDedup() {
  const pendingRecords = (useLiveQuery(
    () => db.dedupRecords.where('status').equals('PENDING').reverse().sortBy('detectTime'),
  ) ?? []) as DedupRecord[]

  // 所有交易 id -> Transaction 映射（供 UI 展示重复对）
  const transactions = (useLiveQuery(() => db.transactions.toArray()) ?? []) as Transaction[]
  const txMap = new Map(transactions.map((t) => [t.id as number, t]))

  // 确保默认策略存在
  const ensureDefaultStrategy = useCallback(async () => {
    const existing = await db.dedupStrategies.get('default')
    if (!existing) {
      await db.dedupStrategies.put({ ...DEFAULT_DEDUP_STRATEGY, createdAt: Date.now(), updatedAt: Date.now() })
    }
    return existing ?? DEFAULT_DEDUP_STRATEGY
  }, [])

  // 运行查重：清掉旧 PENDING，写入新检测到的重复对
  const detect = useCallback(async (): Promise<number> => {
    await ensureDefaultStrategy()
    const allTxs = await db.transactions.toArray()
    const records = detectDuplicates(allTxs)

    await db.transaction('rw', db.dedupRecords, async () => {
      // 清除旧的待审记录（已处理的保留留痕）
      await db.dedupRecords.where('status').equals('PENDING').delete()
      if (records.length > 0) {
        await db.dedupRecords.bulkAdd(records)
      }
    })

    return records.length
  }, [ensureDefaultStrategy])

  // 处理一个重复对：按动作删除/合并对应交易，并更新记录状态
  const handleDuplicate = useCallback(async (record: DedupRecord, action: DedupAction) => {
    if (record.id === undefined) return

    const deleteId =
      action === 'DELETE_A' || action === 'MERGE_KEEP_B' ? record.entryAId
        : action === 'DELETE_B' || action === 'MERGE_KEEP_A' ? record.entryBId
          : null

    if (deleteId !== null) {
      await db.transactions.delete(deleteId)
    }

    const status = action === 'IGNORE' ? 'IGNORED' : action.startsWith('MERGE') ? 'MERGED' : 'DELETED'
    await db.dedupRecords.update(record.id, {
      status,
      action,
      handleTime: Date.now(),
    })
  }, [])

  const clearPending = useCallback(async () => {
    await db.dedupRecords.where('status').equals('PENDING').delete()
  }, [])

  return {
    pendingRecords,
    txMap,
    detect,
    handleDuplicate,
    clearPending,
  }
}
