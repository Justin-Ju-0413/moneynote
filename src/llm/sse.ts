// SSE(Server-Sent Events)流式解析:OpenAI 兼容 chat/completions 的 stream 响应格式。
// 解析器为纯函数状态机(缓冲跨 chunk 断行),供 llmChat 流式路径与单测复用。

export interface SSEParser {
  /** 喂入一段网络 chunk(可含任意断行位置);返回其中已完整行的 data 载荷(按出现顺序) */
  push(chunk: string): string[]
  /** 流结束时调用:冲刷缓冲中最后一行(无尾换行)的 data 载荷 */
  flush(): string[]
}

// 单行 -> data 载荷;非 data 行(注释/event:/id:/retry: 等)返回 undefined
function parseLine(line: string): string | undefined {
  if (line.startsWith(':')) return undefined // SSE 注释/心跳
  if (!line.startsWith('data:')) return undefined
  return line.slice(5).replace(/^ /, '') // "data: " 去掉一个前导空格;无空格也兼容
}

/**
 * 创建流式 SSE 解析器。逐行识别 `data:` 前缀,容忍:
 * - 事件行被任意劈断到多个网络 chunk(粘包/半包,缓冲拼接)
 * - CRLF 换行(行尾 \r 剥离)
 * - 注释行与非 data 字段行(忽略)
 * - `[DONE]` 作为普通 data 载荷透传,由调用方决定终止
 */
export function createSSEParser(): SSEParser {
  let buffer = ''

  const drain = (out: string[]): string[] => {
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      let line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      const data = parseLine(line)
      if (data !== undefined) out.push(data)
      nl = buffer.indexOf('\n')
    }
    return out
  }

  return {
    push(chunk: string): string[] {
      buffer += chunk
      return drain([])
    },
    flush(): string[] {
      const rest = buffer
      buffer = ''
      if (!rest) return []
      const line = rest.endsWith('\r') ? rest.slice(0, -1) : rest
      const data = parseLine(line)
      return data !== undefined ? [data] : []
    },
  }
}

// ── 流式预览:从(可能不完整的)JSON 文本里增量抽取字符串字段 ──

/** 还原 JSON 字符串字面量中的常见转义(预览用途,非完整实现) */
function unescapeJsonString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

/**
 * 从累积的(可能截断的)JSON 文本流中抽取指定字符串字段的「已到达前缀」。
 * 字段值未闭合时返回到目前为止的内容,闭合后返回完整值;字段尚未出现返回 ''。
 * 用途:chat 任务流式返回严格 JSON,UI 从中增量提取 reply/result 等人类可读字段做打字机预览。
 */
export function partialJsonStringField(text: string, field: string): string {
  // (?:"|\\.|[^"\\])* 匹配字符串字面量内部(含转义序列),未闭合时吃到文本末尾
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)
  const m = text.match(re)
  return m ? unescapeJsonString(m[1]) : ''
}
