import type { BillTemplate } from '@/db/types'

// ── 内置模板检测关键词（用于启发式表头匹配）──
export const BUILTIN_DETECTION: Record<string, { keywords: string[]; matchAll: boolean }> = {
  alipay: { keywords: ['交易时间', '收/支', '金额'], matchAll: true },
  wechat: { keywords: ['交易时间', '收/支'], matchAll: true },
  pingan: { keywords: ['交易日期', '交易金额', '摘要'], matchAll: true },
}

const now = Date.now()

// ── 支付宝 CSV 内置模板 ──
export const ALIPAY_TEMPLATE: BillTemplate = {
  fingerprint: '',
  name: '支付宝账单',
  source: 'alipay',
  isBuiltIn: true,
  fileType: 'csv',
  encoding: 'gbk',
  headerRowIndex: -1, // 运行时动态定位
  columnMappings: [
    { columnIndex: 0, originalHeader: '交易时间', normalizedHeader: '交易时间', role: 'date',
      transform: { dateFormat: 'YYYY-MM-DD HH:mm:ss' } },
    { columnIndex: 1, originalHeader: '交易分类', normalizedHeader: '交易分类', role: 'category' },
    { columnIndex: 2, originalHeader: '交易对方', normalizedHeader: '交易对方', role: 'counterparty' },
    { columnIndex: 3, originalHeader: '商品说明', normalizedHeader: '商品说明', role: 'note' },
    { columnIndex: 4, originalHeader: '收/支', normalizedHeader: '收/支', role: 'direction',
      transform: { directionMap: { '收入': 'income', '支出': 'expense' } } },
    { columnIndex: 5, originalHeader: '金额', normalizedHeader: '金额', role: 'amount',
      transform: { amountStripChars: '¥￥,' } },
    { columnIndex: 6, originalHeader: '交易状态', normalizedHeader: '交易状态', role: 'status' },
  ],
  filterRules: [
    { type: 'column_equals', columnIndex: 4, value: '/', action: 'skip', reason: 'internal_transfer' },
    { type: 'column_equals', columnIndex: 4, value: '不计收支', action: 'skip', reason: 'internal_transfer' },
    { type: 'column_equals', columnIndex: 6, value: '交易关闭', action: 'skip', reason: 'closed' },
    { type: 'column_equals', columnIndex: 6, value: '还款失败', action: 'skip', reason: 'failed' },
    { type: 'column_contains', columnIndex: 1, value: '退款', action: 'skip', reason: 'refund' },
    { type: 'column_contains', columnIndex: 3, value: '退款-', action: 'skip', reason: 'refund' },
  ],
  sourceCategoryMap: {
    columnIndex: 1,
    mapping: {
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
    },
  },
  buildClassifyTextFrom: [3, 2], // 商品说明 + 交易对方
  importCount: 0,
  lastUsedAt: 0,
  createdAt: now,
  updatedAt: now,
}

// ── 微信 Excel 内置模板 ──
export const WECHAT_TEMPLATE: BillTemplate = {
  fingerprint: '',
  name: '微信账单',
  source: 'wechat',
  isBuiltIn: true,
  fileType: 'xlsx',
  headerRowIndex: -1,
  columnMappings: [
    { columnIndex: 0, originalHeader: '交易时间', normalizedHeader: '交易时间', role: 'date',
      transform: { dateFormat: 'YYYY-MM-DD HH:mm:ss' } },
    { columnIndex: 1, originalHeader: '交易类型', normalizedHeader: '交易类型', role: 'skip' },
    { columnIndex: 2, originalHeader: '交易对方', normalizedHeader: '交易对方', role: 'counterparty' },
    { columnIndex: 3, originalHeader: '商品', normalizedHeader: '商品', role: 'note' },
    { columnIndex: 4, originalHeader: '收/支', normalizedHeader: '收/支', role: 'direction',
      transform: { directionMap: { '收入': 'income', '支出': 'expense' } } },
    { columnIndex: 5, originalHeader: '金额(元)', normalizedHeader: '金额(元)', role: 'amount',
      transform: { amountStripChars: '¥￥,' } },
    { columnIndex: 6, originalHeader: '备注', normalizedHeader: '备注', role: 'skip' },
    { columnIndex: 7, originalHeader: '当前状态', normalizedHeader: '当前状态', role: 'status' },
  ],
  filterRules: [
    { type: 'column_equals', columnIndex: 4, value: '/', action: 'skip', reason: 'internal_transfer' },
    { type: 'column_equals', columnIndex: 4, value: '不计收支', action: 'skip', reason: 'internal_transfer' },
    { type: 'column_equals', columnIndex: 7, value: '交易关闭', action: 'skip', reason: 'closed' },
    { type: 'column_equals', columnIndex: 7, value: '还款失败', action: 'skip', reason: 'failed' },
    { type: 'column_contains', columnIndex: 3, value: '退款-', action: 'skip', reason: 'refund' },
  ],
  buildClassifyTextFrom: [3, 2], // 商品 + 交易对方
  importCount: 0,
  lastUsedAt: 0,
  createdAt: now,
  updatedAt: now,
}

// ── 平安银行 Excel 内置模板 ──
export const PINGAN_TEMPLATE: BillTemplate = {
  fingerprint: '',
  name: '平安银行账单',
  source: 'pingan',
  isBuiltIn: true,
  fileType: 'xlsx',
  headerRowIndex: -1,
  columnMappings: [
    { columnIndex: 0, originalHeader: '序号', normalizedHeader: '序号', role: 'skip' },
    { columnIndex: 1, originalHeader: '交易日期', normalizedHeader: '交易日期', role: 'date',
      transform: { dateFormat: 'YYYY-MM-DD' } },
    { columnIndex: 2, originalHeader: '交易金额', normalizedHeader: '交易金额', role: 'amount',
      transform: { amountStripChars: '¥￥,', signedAmount: true } },
    { columnIndex: 3, originalHeader: '余额', normalizedHeader: '余额', role: 'balance' },
    { columnIndex: 4, originalHeader: '交易地点', normalizedHeader: '交易地点', role: 'skip' },
    { columnIndex: 5, originalHeader: '摘要', normalizedHeader: '摘要', role: 'note' },
    { columnIndex: 6, originalHeader: '备注', normalizedHeader: '备注', role: 'note',
      transform: {
        cleanPrefixes: [
          '^财付通\\(银联云闪付\\)-',
          '^支付宝（中国）网络技术有限公司-',
          '^支付宝\\(中国\\)网络技术有限公司-',
        ],
      } },
    { columnIndex: 7, originalHeader: '交易对手行', normalizedHeader: '交易对手行', role: 'skip' },
    { columnIndex: 8, originalHeader: '交易对手户名', normalizedHeader: '交易对手户名', role: 'counterparty' },
    { columnIndex: 9, originalHeader: '交易对手账号', normalizedHeader: '交易对手账号', role: 'skip' },
  ],
  filterRules: [
    { type: 'column_contains', columnIndex: 5, value: '退货交易', action: 'skip', reason: 'refund' },
    { type: 'column_contains', columnIndex: 5, value: '基金支付申购', action: 'skip', reason: 'investment' },
    { type: 'column_contains', columnIndex: 5, value: '基金申购', action: 'skip', reason: 'investment' },
    { type: 'column_contains', columnIndex: 5, value: '基金赎回', action: 'skip', reason: 'investment' },
    { type: 'column_contains', columnIndex: 5, value: '结息', action: 'skip', reason: 'interest' },
    { type: 'column_contains', columnIndex: 5, value: '支付利息', action: 'skip', reason: 'interest' },
  ],
  buildClassifyTextFrom: [6, 8], // 备注(cleaned) + 交易对手户名
  importCount: 0,
  lastUsedAt: 0,
  createdAt: now,
  updatedAt: now,
}

// 所有内置模板
export const BUILTIN_TEMPLATES: BillTemplate[] = [
  ALIPAY_TEMPLATE,
  WECHAT_TEMPLATE,
  PINGAN_TEMPLATE,
]
