import { describe, it, expect } from 'vitest'
import { redactSensitive, maybeRedact } from './redact'

describe('redactSensitive', () => {
  it('脱敏 11 位手机号', () => {
    expect(redactSensitive('联系 13800138000 退款')).toBe('联系 [手机号] 退款')
  })

  it('脱敏 15-19 位长号码（订单号/银行卡/身份证）', () => {
    expect(redactSensitive('订单 123456789012345 已完成')).toContain('[长号码]')
    expect(redactSensitive('身份证 110101199003071234')).toContain('[长号码]')
  })

  it('脱敏邮箱', () => {
    expect(redactSensitive('邮件 a.b+c@example.com 联系')).toBe('邮件 [邮箱] 联系')
  })

  it('普通文本不受影响', () => {
    expect(redactSensitive('星巴克拿铁 28 元')).toBe('星巴克拿铁 28 元')
  })

  it('空值安全', () => {
    expect(redactSensitive('')).toBe('')
  })
})

describe('maybeRedact', () => {
  it('privacyMode 关闭时原样返回', () => {
    expect(maybeRedact('13800138000', false)).toBe('13800138000')
  })

  it('privacyMode 开启时脱敏', () => {
    expect(maybeRedact('13800138000', true)).toBe('[手机号]')
  })
})
