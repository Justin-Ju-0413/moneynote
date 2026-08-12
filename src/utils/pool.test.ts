import { describe, it, expect } from 'vitest'
import { runPool } from './pool'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('runPool（C2-a 并发池）', () => {
  it('最大并发不超过限制', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0
    await runPool(items, 2, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await sleep(5)
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(1) // 确实并行过
  })

  it('保序回调（index 与输入一致）', async () => {
    const items = Array.from({ length: 8 }, (_, i) => i)
    const order: number[] = []
    await runPool(items, 3, async (_item, index) => {
      await sleep(Math.random() * 10)
      order.push(index)
    })
    // 完成顺序不保证，但每个 index 恰好回调一次
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 8 }, (_, i) => i))
  })

  it('单 worker 抛错不阻塞其余，结束时抛出首个错误', async () => {
    const items = [0, 1, 2, 3]
    let ran = 0
    await expect(runPool(items, 2, async (item) => {
      ran++
      if (item === 1) throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(ran).toBe(4) // 全部 worker 都执行了
  })

  it('空数组直接返回', async () => {
    let ran = 0
    await runPool([], 2, async () => { ran++ })
    expect(ran).toBe(0)
  })

  it('concurrency <= 0 时 no-op', async () => {
    let ran = 0
    await runPool([1, 2, 3], 0, async () => { ran++ })
    expect(ran).toBe(0)
  })
})
