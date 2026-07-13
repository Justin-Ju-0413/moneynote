// 从原始输入中移除已解析的日期词和金额词，剩余部分作为备注
export function cleanNote(
  text: string,
  dateMatchedText: string,
  amountMatchedText: string,
): string {
  let result = text

  // 移除日期匹配文本
  if (dateMatchedText) {
    result = result.replace(dateMatchedText, '')
  }

  // 移除金额匹配文本
  if (amountMatchedText) {
    result = result.replace(amountMatchedText, '')
  }

  // 移除常见动词前缀
  result = result.replace(/^(花了|花费|用了|消费|支付|付了)/, '')

  // 清理多余的标点符号和空白
  result = result.replace(/^[,，.。:：、\s]+/, '')
  result = result.replace(/[,，.。:：、\s]+$/, '')
  result = result.replace(/\s+/g, ' ')

  return result.trim()
}
