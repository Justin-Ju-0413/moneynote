// 脱敏：发送给 LLM 前清洗交易文本中的敏感片段
// 移植自 项控(ledger-ai-agent) src/services/aiService.ts 的 redactSensitive

/** 对单段文本做敏感信息脱敏：手机号 / 订单号·银行卡·身份证 / 邮箱 / 带称呼的姓名 */
export function redactSensitive(value: string): string {
  if (!value) return value
  return value
    .replace(/\b\d{11}\b/g, '[手机号]') // 11 位手机号
    .replace(/\b\d{15,19}\b/g, '[长号码]') // 15-19 位订单号 / 银行卡 / 身份证
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[邮箱]')
    // 仅当中文姓名带称呼时脱敏（如"张三先生"），避免误伤"星巴克"等商户名
    .replace(/([一-龥]{2,4})(先生|女士|老师|同学)/g, '[姓名]')
}

/** 按需脱敏：privacyMode 关闭时原样返回 */
export function maybeRedact(value: string, privacyMode: boolean): string {
  return privacyMode ? redactSensitive(value) : value
}
