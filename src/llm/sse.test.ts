import { describe, it, expect } from 'vitest'
import { createSSEParser, partialJsonStringField } from './sse'

describe('createSSEParser', () => {
  it('单 chunk 内多个 data 事件按顺序解析', () => {
    const p = createSSEParser()
    const out = p.push('data: {"a":1}\n\ndata: {"b":2}\n\n')
    expect(out).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('跨 chunk 粘包/断行:一行 data 被劈成多段时缓冲拼接', () => {
    const p = createSSEParser()
    expect(p.push('data: {"con')).toEqual([])
    expect(p.push('tent":"hel')).toEqual([])
    expect(p.push('lo"}\n\n')).toEqual(['{"content":"hello"}'])
  })

  it('两个事件挤在同一 chunk 中间无空行也能逐行切分', () => {
    const p = createSSEParser()
    const out = p.push('data: A\ndata: B\n')
    expect(out).toEqual(['A', 'B'])
  })

  it('[DONE] 作为 data 载荷透传,由调用方决定终止', () => {
    const p = createSSEParser()
    const out = p.push('data: {"x":1}\n\ndata: [DONE]\n\n')
    expect(out).toEqual(['{"x":1}', '[DONE]'])
  })

  it('非 data 行与注释行被忽略(event:/id:/retry:/:/空行)', () => {
    const p = createSSEParser()
    const out = p.push(': keep-alive\nevent: ping\nid: 42\nretry: 1000\n\ndata: ok\n\n')
    expect(out).toEqual(['ok'])
  })

  it('data: 后无空格也能解析(兼容紧凑形态)', () => {
    const p = createSSEParser()
    expect(p.push('data:{"a":1}\n')).toEqual(['{"a":1}'])
  })

  it('CRLF 换行:行尾 \\r 被剥离,不进载荷', () => {
    const p = createSSEParser()
    expect(p.push('data: hello\r\n\r\n')).toEqual(['hello'])
  })

  it('坏行容错:前缀不是 data 的行直接丢弃,不影响后续事件', () => {
    const p = createSSEParser()
    const out = p.push('garbage line\nnot-data: x\ndata: good\n')
    expect(out).toEqual(['good'])
  })

  it('flush 返回缓冲中无尾换行的最后一行 data', () => {
    const p = createSSEParser()
    p.push('data: first\n')
    expect(p.push('data: second')).toEqual([]) // 无换行,暂不出
    expect(p.flush()).toEqual(['second'])
    expect(p.flush()).toEqual([]) // 冲刷后缓冲为空
  })

  it('flush 对非 data 尾行返回空', () => {
    const p = createSSEParser()
    p.push('event: ping')
    expect(p.flush()).toEqual([])
  })

  it('data: 空载荷返回空字符串事件(由上层 JSON 解析容错)', () => {
    const p = createSSEParser()
    expect(p.push('data:\n')).toEqual([''])
  })
})

describe('partialJsonStringField', () => {
  it('完整 JSON 中抽取目标字符串字段', () => {
    expect(partialJsonStringField('{"intent":"chat","reply":"本月支出 ¥100"}', 'reply')).toBe('本月支出 ¥100')
  })

  it('流式截断:字段值未闭合时返回已到达前缀', () => {
    const acc = '{"intent":"chat","reply":"本月支出 ¥1'
    expect(partialJsonStringField(acc, 'reply')).toBe('本月支出 ¥1')
  })

  it('字段尚未出现时返回空字符串', () => {
    expect(partialJsonStringField('{"intent":"reco', 'reply')).toBe('')
    expect(partialJsonStringField('', 'reply')).toBe('')
  })

  it('字段闭合后不再吞后续内容(止于闭引号)', () => {
    expect(partialJsonStringField('{"reply":"记一笔?","txId":3}', 'reply')).toBe('记一笔?')
  })

  it('常见转义(\\n \\" \\\\ \\t)还原为真实字符', () => {
    expect(partialJsonStringField('{"reply":"a\\nb \\"q\\" c\\\\d\\te"}', 'reply')).toBe('a\nb "q" c\\d\te')
  })

  it('键名与冒号间允许空白', () => {
    expect(partialJsonStringField('{"result"  :  "支出 ¥35"}', 'result')).toBe('支出 ¥35')
  })

  it('嵌套对象中的同名字段按首个出现抽取(流式预览用途足够)', () => {
    expect(partialJsonStringField('{"a":{"result":"x"},"result":"y"}', 'result')).toBe('x')
  })
})
