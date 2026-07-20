// AI 任务注册抽象(P1-2):把「构建消息 -> 调 llmChat -> 错误守卫 -> 解析 -> 校验 -> 回退」
// 的通用骨架收敛为 runTask。新 AI 任务只需提供一个 TaskDescriptor 描述符,无需改动调度逻辑。
// 为 P1-3(prompt 版本化,cacheKey 纳入 name/version)与 P1-4(bill-analyzer 并入 llm 层)铺路。
import { llmChat, llmErrorMessage } from './client'
import type { LLMChatOptions } from './client'
import type { LLMConfig } from './types'

type Message = { role: string; content: string }

export interface TaskContext {
  config: LLMConfig
  /** 是否脱敏;各任务在 buildMessages 中按需使用(批量分类/审计用,单条解析不脱敏) */
  privacyMode: boolean
}

/** llmChat 选项子集:任务级 maxTokens/timeout/temperature/responseFormat */
export type TaskChatOptions = Pick<LLMChatOptions, 'maxTokens' | 'timeout' | 'temperature' | 'responseFormat'>

export interface TaskDescriptor<I, O> {
  /** 任务名(日志标识;P1-3 将并入 cacheKey) */
  name: string
  /** 构建消息数组 */
  buildMessages: (input: I, ctx: TaskContext) => Message[]
  /** llmChat 选项(静态;如 maxTokens/timeout/responseFormat) */
  chatOptions: TaskChatOptions
  /** 解析 content;返回 null 视为解析失败 */
  parse: (content: string, input: I) => O | null
  /** 校验解析结果是否可用,默认 parsed !== null(审计用此判断 suggestions 非空) */
  validate?: (parsed: O, input: I) => boolean
  /** 失败回退(errorKind/空/解析失败/校验不过时调用);未提供则向调用方返回 error */
  fallback?: (input: I, ctx: TaskContext) => O
  /** 空 content 处理:'error'(默认,返回 error='empty')|'parse'(交 parse,审计用) */
  onEmpty?: 'error' | 'parse'
}

export interface TaskRunResult<O> {
  result: O | null
  error?: string
}

export async function runTask<I, O>(
  task: TaskDescriptor<I, O>,
  input: I,
  ctx: TaskContext,
): Promise<TaskRunResult<O>> {
  const { content, errorKind, errorMessage } = await llmChat(ctx.config, {
    messages: task.buildMessages(input, ctx),
    ...task.chatOptions,
  })

  // 1. 传输/配置/HTTP 错误 -> 回退(带 error)或上报 error
  if (errorKind) {
    const error = llmErrorMessage(errorKind, errorMessage)
    return task.fallback
      ? { result: task.fallback(input, ctx), error }
      : { result: null, error }
  }

  // 2. 空 content:默认视为错误;onEmpty='parse' 的任务(审计)交由 parse 处理
  const empty = !content
  if (empty && task.onEmpty !== 'parse') {
    return task.fallback
      ? { result: task.fallback(input, ctx), error: 'empty' }
      : { result: null, error: 'empty' }
  }

  // 3. 解析 + 校验
  const parsed = task.parse(content ?? '', input)
  const ok = parsed !== null && (!task.validate || task.validate(parsed, input))
  if (!ok) {
    // 解析/校验失败的回退不带 error(LLM 有响应但结果不可用,静默降级)
    return task.fallback
      ? { result: task.fallback(input, ctx) }
      : { result: null, error: empty ? 'empty' : 'parse' }
  }
  return { result: parsed }
}
