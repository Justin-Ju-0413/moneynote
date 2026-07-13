/**
 * 账单导入测试脚本
 * 用法: node scripts/test-import.mjs
 * 测试真实账单文件的解析、分类、过滤逻辑
 */

import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import * as XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HOME

// ── 支付宝分类映射 (同 billClassifier.ts) ──
const ALIPAY_CATEGORY_MAP = {
  '餐饮美食': 'food',
  '交通出行': 'transport',
  '日用百货': 'shopping',
  '服饰装扮': 'shopping',
  '数码电器': 'shopping',
  '美容美发': 'entertainment',
  '运动健身': 'entertainment',
  '休闲娱乐': 'entertainment',
  '文化休闲': 'entertainment',
  '酒店旅游': 'entertainment',
  '住房缴费': 'housing',
  '居家生活': 'housing',
  '医疗健康': 'medical',
  '教育培训': 'education',
  '母婴亲子': 'shopping',
  '商业服务': 'other',
  '信用借还': 'other',
  '转账红包': 'other',
  '充值缴费': 'other',
  '投资理财': 'other',
  '其他': 'other',
}

// ── 关键词词典 (同 categoryMatcher.ts) ──
const BUILTIN_KEYWORDS = {
  food: ['早餐','午餐','午饭','晚餐','晚饭','吃饭','外卖','咖啡','coffee','奶茶','火锅','烧烤','快餐','水果','零食','饮料','茶','买菜','做饭','麦当劳','肯德基','星巴克','starbucks','kfc','宵夜','面条','米饭','汉堡','披萨','米线','粉面','粥','豆浆','包子','饺子','炸鸡','蛋糕','面包','甜品','寿司','拉面','炒菜','盖浇饭','便当','吉野家','真功夫','永和豆浆','点餐','牛肉店','串串','鸡煲','糖水','茶饮','肠粉','炖汤','潮汕','猪脚','卤味','麻辣烫','黄焖鸡','沙拉','轻食','云吞','米粉','酸辣粉','冒菜'],
  transport: ['打车','地铁','公交','加油','停车','滴滴','taxi','uber','高铁','火车','机票','飞机','自行车','共享单车','过路费','充电','高速','油费','出行','出租车','摩拜','哈啰','骑车','开车','停车场','停车费','充电桩','充电站','etc','网约车','代驾','航空','铁路','12306','携程','去哪儿','飞猪','岭南通','公交卡','交通卡','嘀嘀','高德','神州租车','一嗨','租车','特来电','云快充','新电途','顺风车'],
  shopping: ['衣服','裤子','鞋','包','淘宝','京东','拼多多','超市','购物','数码','手机','电脑','护肤','化妆','日用','洗护','裙子','外套','帽子','眼镜','手表','饰品','礼物','礼品','天猫','唯品会','苏宁','亚马逊','amazon','苹果','apple','母婴','尿不湿','奶粉','婴儿','名创优品','屈臣氏','万达','便利店','百货','商城','小米','华为','oppo','vivo','荣耀','三星','联想'],
  entertainment: ['电影','游戏','ktv','唱歌','演出','门票','游乐','旅游','景点','酒店','民宿','健身','游泳','spa','足浴','按摩','剧本杀','密室','展览','演唱会','话剧','酒吧','夜店','app store','steam','百度网盘','网易云','spotify','netflix','bilibili','哔哩哔哩','优酷','爱奇艺','腾讯视频','会员','抖音','快手','小红书','apple music','网吧','温泉','景区','公园','棋牌','电竞','deepseek','深度求索'],
  housing: ['房租','租金','水费','电费','水电气','物业','物业费','装修','家具','家电','维修','宽带','网费','房贷','月供','燃气','暖气','供暖','自来水','家政','保洁'],
  medical: ['看病','医院','药','药店','体检','牙科','眼科','门诊','住院','挂号','检查','手术','保险','医疗','感冒','发烧','核酸','疫苗','中药','西药','药房','诊所','康复','海王星辰','大参林','国大药房','快药店','健之佳'],
  education: ['书','书籍','课程','培训','学费','文具','考试','报名','学习','网课','教材','补习','家教','辅导','学历认证','学信','教育部','学位','毕业证','考研','公务员','驾校','学车'],
}

function matchCategory(text) {
  const lowerText = text.toLowerCase()
  const scores = {}
  for (const [category, keywords] of Object.entries(BUILTIN_KEYWORDS)) {
    for (const keyword of keywords) {
      const lk = keyword.toLowerCase()
      if (lowerText.includes(lk)) {
        const score = (scores[category]?.score || 0) + 10 + lk.length
        if (!scores[category] || score > scores[category].score) {
          scores[category] = { score, keyword }
        }
      }
    }
  }
  let best = 'other', bestScore = 0, bestKw = ''
  for (const [cat, { score, keyword }] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; best = cat; bestKw = keyword }
  }
  let confidence = 'low'
  if (bestScore >= 15) confidence = 'high'
  else if (bestScore >= 10) confidence = 'medium'
  return { category: best, confidence, matchedKeyword: bestKw }
}

// ── CSV 解析 (同 import.ts) ──
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'; i++
      } else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else { current += ch }
  }
  result.push(current)
  return result
}

function parseAlipayCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('交易时间') || lines[i].includes('交易时间,交易分类')) {
      headerIndex = i; break
    }
  }
  if (headerIndex === -1) throw new Error('找不到表头')
  const headers = parseCSVLine(lines[headerIndex])
  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < 3) continue
    const fields = {}
    headers.forEach((h, idx) => { fields[h.trim()] = (values[idx] || '').trim() })
    if (!fields['收/支']) continue
    rows.push({ source: 'alipay', fields })
  }
  return rows
}

function parseWeChatExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  let headerIndex = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && String(data[i][0]).trim() === '交易时间') { headerIndex = i; break }
  }
  if (headerIndex === -1) throw new Error('微信表头未找到')
  const headers = data[headerIndex].map(h => String(h || '').trim())
  const rows = []
  for (let i = headerIndex + 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData || rowData.length < 3) continue
    const fields = {}
    headers.forEach((h, idx) => {
      const cell = rowData[idx]
      if (cell instanceof Date) {
        if (h === '交易时间') {
          const y = cell.getFullYear()
          const m = String(cell.getMonth() + 1).padStart(2, '0')
          const d = String(cell.getDate()).padStart(2, '0')
          const hh = String(cell.getHours()).padStart(2, '0')
          const mm = String(cell.getMinutes()).padStart(2, '0')
          const ss = String(cell.getSeconds()).padStart(2, '0')
          fields[h] = `${y}-${m}-${d} ${hh}:${mm}:${ss}`
        } else {
          fields[h] = cell.toISOString().split('T')[0]
        }
      } else {
        fields[h] = String(cell ?? '').trim()
      }
    })
    if (!fields['收/支']) continue
    rows.push({ source: 'wechat', fields })
  }
  return rows
}

// ── 过滤 + 分类 (同 billClassifier.ts) ──
function shouldSkipRow(row) {
  if (row.source === 'pingan') return shouldSkipPingAnRow(row)
  const fields = row.fields
  const direction = fields['收/支'] || ''
  const status = fields['当前状态'] || fields['交易状态'] || ''
  const txType = fields['交易类型'] || fields['交易分类'] || ''
  if (direction === '/') return 'internal_transfer'
  if (direction === '不计收支') return 'internal_transfer'
  if (status === '交易关闭') return 'closed'
  if (status === '还款失败') return 'failed'
  if (txType.includes('退款')) return 'refund'
  if (fields['商品说明']?.startsWith('退款-') || fields['商品']?.startsWith('退款-')) return 'refund'
  return null
}

function shouldSkipPingAnRow(row) {
  const summary = row.fields['摘要'] || ''
  const amount = parseFloat(row.fields['金额'] || '')
  if (summary.includes('退货交易')) return 'refund'
  if (summary.includes('基金支付申购') || summary.includes('基金申购') || summary.includes('基金赎回')) return 'investment'
  if ((summary.includes('结息') || summary.includes('支付利息')) && !isNaN(amount) && amount < 1) return 'interest'
  return null
}

function mapRow(row) {
  const fields = row.fields
  const dateTimeStr = fields['交易时间'] || ''
  const [datePart, timePart] = dateTimeStr.split(' ')
  if (!datePart) return null
  const date = datePart.length === 10 ? datePart : datePart.replace(/\//g, '-')
  const time = timePart ? timePart.slice(0, 5) : undefined
  const rawAmount = fields['金额'] || fields['金额(元)'] || ''
  const amount = parseFloat(rawAmount.replace(/[¥￥,]/g, ''))
  if (isNaN(amount) || amount <= 0) return null
  const direction = fields['收/支'] || ''
  const type = direction === '收入' ? 'income' : 'expense'
  const note = fields['商品说明'] || fields['商品'] || fields['交易对方'] || ''
  return { amount, category: 'other', date, time, note: note === '/' ? undefined : note, type }
}

function classifyRow(row) {
  const tx = mapRow(row)
  if (!tx) return null
  const product = row.fields['商品说明'] || row.fields['商品'] || ''
  const counterparty = row.fields['交易对方'] || ''
  const classifyText = `${product} ${counterparty}`.trim()

  if (row.source === 'alipay') {
    const alipayCat = row.fields['交易分类']
    if (alipayCat && ALIPAY_CATEGORY_MAP[alipayCat]) {
      tx.category = ALIPAY_CATEGORY_MAP[alipayCat]
    }
  }
  if (tx.category === 'other') {
    const match = matchCategory(classifyText)
    if (match.confidence !== 'low') {
      tx.category = match.category
    }
  }
  return { tx, classifyText }
}

// ── 平安银行解析 ──
function parsePingAnExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  let headerIndex = -1
  const scanLimit = Math.min(20, data.length)
  for (let i = 0; i < scanLimit; i++) {
    const row = data[i]
    if (!row) continue
    const cells = row.map(c => String(c ?? '').trim())
    if (cells.some(c => c.includes('交易日期')) && cells.some(c => c.includes('交易金额'))) {
      headerIndex = i; break
    }
  }
  if (headerIndex === -1) throw new Error('无法识别平安银行账单格式')

  // 标准化表头：取换行符前的中文部分
  const headers = data[headerIndex].map(h => {
    const full = String(h || '').trim()
    const nl = full.indexOf('\n')
    return nl > 0 ? full.slice(0, nl).trim() : full
  })
  const rows = []

  for (let i = headerIndex + 1; i < data.length; i++) {
    const rowData = data[i]
    if (!rowData || rowData.length < 3) continue

    const raw = {}
    headers.forEach((h, idx) => {
      const cell = rowData[idx]
      if (cell instanceof Date) {
        const y = cell.getFullYear()
        const m = String(cell.getMonth() + 1).padStart(2, '0')
        const d = String(cell.getDate()).padStart(2, '0')
        raw[h] = `${y}-${m}-${d}`
      } else {
        raw[h] = String(cell ?? '').trim()
      }
    })

    const rawAmountStr = raw['交易金额'] || ''
    const amountNum = parseFloat(rawAmountStr.replace(/[¥￥,]/g, ''))
    if (isNaN(amountNum) || amountNum === 0) continue

    const fields = {
      '交易时间': raw['交易日期'] || '',
      '金额': String(Math.abs(amountNum)),
      '收/支': amountNum < 0 ? '支出' : '收入',
      '备注': raw['备注'] || '',
      '摘要': raw['摘要'] || '',
      '交易对手户名': raw['交易对手户名'] || '',
      '交易对方': raw['交易对手户名'] || '',
      '交易对手行': raw['交易对手行'] || '',
      '余额': raw['余额'] || '',
      '交易地点': raw['交易地点'] || '',
      '序号': raw['序号'] || '',
    }
    rows.push({ source: 'pingan', fields })
  }
  return rows
}

function buildPingAnClassifyText(row) {
  const parts = []
  const note = row.fields['备注']
  if (note && note !== '/') {
    const cleaned = note
      .replace(/^财付通\(银联云闪付\)-/, '')
      .replace(/^支付宝（中国）网络技术有限公司-/, '')
      .replace(/^支付宝\(中国\)网络技术有限公司-/, '')
    parts.push(cleaned)
  }
  const cp = row.fields['交易对手户名']
  if (cp && cp !== '/') parts.push(cp)
  return parts.join(' ').trim()
}

function classifyPingAnRow(row) {
  const tx = mapRow(row)
  if (!tx) return null
  const classifyText = buildPingAnClassifyText(row)
  const match = matchCategory(classifyText)
  if (match.confidence !== 'low') {
    tx.category = match.category
  }
  return { tx, classifyText }
}

// ── 测试执行 ──
async function testAlipayCSV(filePath, label) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试: ${label}`)
  console.log(`文件: ${filePath}`)
  console.log('='.repeat(60))

  const buffer = await readFile(filePath)
  // GBK 解码
  let text
  try {
    text = new TextDecoder('gbk').decode(buffer)
    if (!text.includes('交易时间')) text = new TextDecoder('utf-8').decode(buffer)
  } catch { text = new TextDecoder('utf-8').decode(buffer) }

  const rows = parseAlipayCSV(text)
  console.log(`\n解析结果: ${rows.length} 条原始行`)

  const skipReasons = {}
  let skipped = 0
  const imported = []

  for (const row of rows) {
    const skip = shouldSkipRow(row)
    if (skip) { skipped++; skipReasons[skip] = (skipReasons[skip] || 0) + 1; continue }
    const result = classifyRow(row)
    if (!result) { skipped++; skipReasons['invalid'] = (skipReasons['invalid'] || 0) + 1; continue }
    imported.push(result)
  }

  console.log(`过滤跳过: ${skipped} 条`)
  for (const [reason, count] of Object.entries(skipReasons)) {
    console.log(`  - ${reason}: ${count}`)
  }
  console.log(`可导入:   ${imported.length} 条`)

  // 分类统计
  const catCount = {}
  const typeCount = { expense: 0, income: 0 }
  for (const { tx } of imported) {
    catCount[tx.category] = (catCount[tx.category] || 0) + 1
    typeCount[tx.type]++
  }
  console.log(`\n收支统计: 支出 ${typeCount.expense}, 收入 ${typeCount.income}`)
  console.log('分类分布:')
  for (const [cat, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(16)} ${count}`)
  }

  // 打印前5条 sample
  console.log('\n前 5 条导入示例:')
  for (const { tx, classifyText } of imported.slice(0, 5)) {
    console.log(`  ${tx.date} ${tx.time || '--:--'} ¥${tx.amount.toFixed(2).padStart(8)} [${tx.category.padEnd(13)}] ${tx.note?.slice(0, 40) || ''}`)
  }

  // 检查去重键
  const dedupKeys = new Set()
  let dupCount = 0
  for (const { tx } of imported) {
    const key = `${tx.date}|${tx.amount}|${tx.note || ''}`
    if (dedupKeys.has(key)) dupCount++
    dedupKeys.add(key)
  }
  if (dupCount > 0) {
    console.log(`\n⚠️  发现 ${dupCount} 条重复记录 (date+amount+note 相同，去重后会跳过)`)
  } else {
    console.log('\n✅ 无重复记录')
  }

  return { rows: rows.length, imported: imported.length, skipped }
}

async function testWeChatExcel(filePath, label) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试: ${label}`)
  console.log(`文件: ${filePath}`)
  console.log('='.repeat(60))

  const buffer = await readFile(filePath)
  let rows
  try {
    rows = parseWeChatExcel(buffer)
  } catch (err) {
    console.log(`❌ 解析失败: ${err.message}`)

    // 尝试诊断：打印前几行数据
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    console.log(`\n诊断 - 表名: ${wb.SheetNames}`)
    console.log(`总行数: ${data.length}`)
    console.log('前 10 行:')
    for (let i = 0; i < Math.min(10, data.length); i++) {
      console.log(`  [${i}] ${JSON.stringify(data[i]?.slice(0, 6))}`)
    }
    return { rows: 0, imported: 0, skipped: 0 }
  }

  console.log(`\n解析结果: ${rows.length} 条原始行`)

  const skipReasons = {}
  let skipped = 0
  const imported = []

  for (const row of rows) {
    const skip = shouldSkipRow(row)
    if (skip) { skipped++; skipReasons[skip] = (skipReasons[skip] || 0) + 1; continue }
    const result = classifyRow(row)
    if (!result) { skipped++; skipReasons['invalid'] = (skipReasons['invalid'] || 0) + 1; continue }
    imported.push(result)
  }

  console.log(`过滤跳过: ${skipped} 条`)
  for (const [reason, count] of Object.entries(skipReasons)) {
    console.log(`  - ${reason}: ${count}`)
  }
  console.log(`可导入:   ${imported.length} 条`)

  if (imported.length > 0) {
    console.log('\n前 5 条导入示例:')
    for (const { tx } of imported.slice(0, 5)) {
      console.log(`  ${tx.date} ${tx.time || '--:--'} ¥${tx.amount.toFixed(2).padStart(8)} [${tx.category.padEnd(13)}] ${tx.note?.slice(0, 40) || ''}`)
    }
  }

  return { rows: rows.length, imported: imported.length, skipped }
}

async function testPingAnExcel(filePath, label) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试: ${label}`)
  console.log(`文件: ${filePath}`)
  console.log('='.repeat(60))

  const buffer = await readFile(filePath)
  let rows
  try {
    rows = parsePingAnExcel(buffer)
  } catch (err) {
    console.log(`❌ 解析失败: ${err.message}`)
    return { rows: 0, imported: 0, skipped: 0 }
  }

  console.log(`\n解析结果: ${rows.length} 条原始行`)

  const skipReasons = {}
  let skipped = 0
  const imported = []
  let needsLLM = 0

  for (const row of rows) {
    const skip = shouldSkipRow(row)
    if (skip) { skipped++; skipReasons[skip] = (skipReasons[skip] || 0) + 1; continue }
    const result = classifyPingAnRow(row)
    if (!result) { skipped++; skipReasons['invalid'] = (skipReasons['invalid'] || 0) + 1; continue }
    if (result.tx.category === 'other') needsLLM++
    imported.push(result)
  }

  console.log(`过滤跳过: ${skipped} 条`)
  for (const [reason, count] of Object.entries(skipReasons)) {
    console.log(`  - ${reason}: ${count}`)
  }
  console.log(`可导入:   ${imported.length} 条`)
  console.log(`需要 LLM: ${needsLLM} 条 (分类为 other)`)

  // 分类统计
  const catCount = {}
  const typeCount = { expense: 0, income: 0 }
  for (const { tx } of imported) {
    catCount[tx.category] = (catCount[tx.category] || 0) + 1
    typeCount[tx.type]++
  }
  console.log(`\n收支统计: 支出 ${typeCount.expense}, 收入 ${typeCount.income}`)
  console.log('分类分布:')
  for (const [cat, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(16)} ${count}`)
  }

  // 打印前 10 条 sample
  console.log('\n前 10 条导入示例:')
  for (const { tx, classifyText } of imported.slice(0, 10)) {
    console.log(`  ${tx.date} ${tx.time || '--:--'} ¥${tx.amount.toFixed(2).padStart(8)} [${tx.category.padEnd(13)}] ${(tx.note || '').slice(0, 50)}`)
    if (classifyText) console.log(`    ↳ classifyText: ${classifyText.slice(0, 60)}`)
  }

  // 去重检查
  const dedupKeys = new Set()
  let dupCount = 0
  for (const { tx } of imported) {
    const key = `${tx.date}|${tx.amount}|${tx.note || ''}`
    if (dedupKeys.has(key)) dupCount++
    dedupKeys.add(key)
  }
  if (dupCount > 0) {
    console.log(`\n⚠️  发现 ${dupCount} 条重复记录`)
  } else {
    console.log('\n✅ 无重复记录')
  }

  return { rows: rows.length, imported: imported.length, skipped }
}

// ── 主流程 ──
async function main() {
  console.log('MoneyNote 账单导入测试')
  console.log(`时间: ${new Date().toISOString()}`)

  const results = []

  // 测试 1: 支付宝 CSV (4月-5月)
  try {
    const r = await testAlipayCSV(
      `${HOME}/Documents/06-财务文档/支付宝交易明细(20260409-20260509).csv`,
      '支付宝 CSV (2026-04-09 ~ 2026-05-09)'
    )
    results.push({ name: '支付宝 4-5月', ...r })
  } catch (err) {
    console.log(`❌ 测试失败: ${err.message}`)
  }

  // 测试 2: 支付宝 CSV (1月-2月)
  try {
    const r = await testAlipayCSV(
      `${HOME}/Documents/06-财务文档/支付宝/支付宝交易明细(20260125-20260225).csv`,
      '支付宝 CSV (2026-01-25 ~ 2026-02-25)'
    )
    results.push({ name: '支付宝 1-2月', ...r })
  } catch (err) {
    console.log(`❌ 测试失败: ${err.message}`)
  }

  // 测试 3: 微信 Excel
  try {
    const r = await testWeChatExcel(
      `${HOME}/Documents/06-财务文档/微信支付账单流水文件(20260502-20260509)_20260509011551.xlsx`,
      '微信 Excel (2026-05-02 ~ 2026-05-09)'
    )
    results.push({ name: '微信 5月', ...r })
  } catch (err) {
    console.log(`❌ 测试失败: ${err.message}`)
  }

  // 测试 4: 平安银行 Excel
  try {
    const r = await testPingAnExcel(
      `${HOME}/Downloads/平安银行个人账户交易明细 JYLS260622049046.xlsx`,
      '平安银行 Excel (2026-03-22 ~ 2026-06-21)'
    )
    results.push({ name: '平安银行', ...r })
  } catch (err) {
    console.log(`❌ 测试失败: ${err.message}`)
  }

  // 汇总
  console.log(`\n${'='.repeat(60)}`)
  console.log('测试汇总')
  console.log('='.repeat(60))
  for (const r of results) {
    console.log(`  ${r.name.padEnd(16)} 原始 ${String(r.rows).padStart(4)} 条 → 可导入 ${String(r.imported).padStart(4)} 条 (跳过 ${r.skipped})`)
  }
  const totalImported = results.reduce((s, r) => s + r.imported, 0)
  console.log(`\n总计可导入: ${totalImported} 条记录`)
}

main().catch(console.error)
