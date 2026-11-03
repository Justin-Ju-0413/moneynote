import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDedup } from './useDedup'
import { db } from '@/db'
import type { Transaction } from '@/db/types'

async function addTx(over: Partial<Transaction>): Promise<number> {
  const id = await db.transactions.add({
    amount: 25, category: 'food', date: '2026-09-10', type: 'expense',
    note: '星巴克拿铁', createdAt: 1, updatedAt: 1,
    ...over,
  } as Transaction)
  return id as number
}

describe('useDedup', () => {
  beforeEach(async () => {
    await Promise.all([
      db.transactions.clear(), db.dedupRecords.clear(), db.dedupStrategies.clear(),
    ])
  })

  it('空库 detect 返回 0 且确保默认策略落库', async () => {
    const { result } = renderHook(() => useDedup())
    let count = -1
    await act(async () => { count = await result.current.detect() })
    expect(count).toBe(0)
    expect(await db.dedupStrategies.get('default')).toBeDefined()
    expect(await db.dedupRecords.count()).toBe(0)
  })

  it('完全相同的两笔交易被检测为重复对，pendingRecords 响应式更新', async () => {
    const idA = await addTx({})
    const idB = await addTx({ note: '星巴克拿铁' }) // amount/date/note 全同
    const { result } = renderHook(() => useDedup())

    let count = -1
    await act(async () => { count = await result.current.detect() })
    expect(count).toBe(1)

    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(1))
    const record = result.current.pendingRecords[0]
    expect(record.status).toBe('PENDING')
    expect([record.entryAId, record.entryBId].sort()).toEqual([idA, idB].sort())
    expect(result.current.txMap.get(idA)?.note).toBe('星巴克拿铁')
  })

  it('handleDuplicate DELETE_A：删除 A 笔、记录状态 DELETED、返回被删交易', async () => {
    const idA = await addTx({ createdAt: 1 })
    const idB = await addTx({ createdAt: 2 })
    const { result } = renderHook(() => useDedup())
    await act(async () => { await result.current.detect() })
    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(1))
    const record = result.current.pendingRecords[0]

    let deleted = null as Transaction | null
    await act(async () => { deleted = await result.current.handleDuplicate(record, 'DELETE_A') })

    expect((await db.transactions.get(idA))).toBeUndefined()
    expect(await db.transactions.get(idB)).toBeDefined()
    expect(deleted?.id).toBe(idA)
    const updated = await db.dedupRecords.get(record.id as number)
    expect(updated?.status).toBe('DELETED')
    expect(updated?.action).toBe('DELETE_A')
  })

  it('handleDuplicate IGNORE：不删交易、状态 IGNORED、返回 null', async () => {
    await addTx({})
    await addTx({})
    const { result } = renderHook(() => useDedup())
    await act(async () => { await result.current.detect() })
    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(1))
    const record = result.current.pendingRecords[0]

    let deleted: Transaction | null = { id: -1 } as unknown as Transaction
    await act(async () => { deleted = await result.current.handleDuplicate(record, 'IGNORE') })

    expect(deleted).toBeNull()
    expect(await db.transactions.count()).toBe(2)
    const updated = await db.dedupRecords.get(record.id as number)
    expect(updated?.status).toBe('IGNORED')
  })

  it('handleDuplicate MERGE_KEEP_B：保留 B 删除 A，状态 MERGED', async () => {
    const idA = await addTx({ createdAt: 1 })
    await addTx({ createdAt: 2 })
    const { result } = renderHook(() => useDedup())
    await act(async () => { await result.current.detect() })
    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(1))
    const record = result.current.pendingRecords[0]

    await act(async () => { await result.current.handleDuplicate(record, 'MERGE_KEEP_B') })
    expect(await db.transactions.get(idA)).toBeUndefined()
    const updated = await db.dedupRecords.get(record.id as number)
    expect(updated?.status).toBe('MERGED')
  })

  it('clearPending 清空待审记录（已处理留痕保留）', async () => {
    await addTx({})
    await addTx({})
    await addTx({ amount: 88, note: '重复B' })
    await addTx({ amount: 88, note: '重复B' })
    const { result } = renderHook(() => useDedup())
    await act(async () => { await result.current.detect() })
    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(2))

    // 先处理掉第一对（留痕），再 clearPending 应只清掉剩余 PENDING
    await act(async () => { await result.current.handleDuplicate(result.current.pendingRecords[0], 'IGNORE') })
    await act(async () => { await result.current.clearPending() })

    expect(await db.dedupRecords.where('status').equals('PENDING').count()).toBe(0)
    expect(await db.dedupRecords.where('status').equals('IGNORED').count()).toBe(1)
  })

  it('重复 detect 用新结果替换旧 PENDING', async () => {
    await addTx({})
    await addTx({})
    const { result } = renderHook(() => useDedup())
    let count = 0
    await act(async () => { count = await result.current.detect() })
    expect(count).toBe(1)
    await waitFor(() => expect(result.current.pendingRecords).toHaveLength(1))

    // 删掉一笔后重跑：不应再有重复对，旧 PENDING 被清空
    const first = (await db.transactions.toArray())[0]
    await db.transactions.delete(first.id as number)
    await act(async () => { count = await result.current.detect() })
    expect(count).toBe(0)
    expect(await db.dedupRecords.where('status').equals('PENDING').count()).toBe(0)
  })
})
