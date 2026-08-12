// ── 并发池（C2-a）──
// 限流 + 保序回调 + 单 worker 异常不阻塞其余（结束时向上抛首个错误，由调用方决定处理）。
// 用于 LLM 分批并行：结果按下标回写，输出与串行一致。

/** LLM 并发度：2 避免限流/超时风暴（429 已有错误映射） */
export const LLM_CONCURRENCY = 2

export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0 || concurrency <= 0) return

  let next = 0
  let running = 0
  let firstError: unknown = null

  await new Promise<void>((resolve, reject) => {
    const pump = () => {
      while (running < concurrency && next < items.length) {
        const index = next
        const item = items[index]
        next++
        running++
        worker(item, index)
          .catch((err) => { if (firstError === null) firstError = err })
          .finally(() => {
            running--
            pump()
          })
      }
      if (running === 0) {
        if (firstError !== null) reject(firstError)
        else resolve()
      }
    }
    pump()
  })
}
