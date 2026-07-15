import type { ColumnRole } from '@/db/types'

export const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'date', label: '日期' },
  { value: 'amount', label: '金额' },
  { value: 'direction', label: '收支方向' },
  { value: 'note', label: '备注' },
  { value: 'counterparty', label: '交易对方' },
  { value: 'category', label: '分类' },
  { value: 'status', label: '状态' },
  { value: 'balance', label: '余额' },
  { value: 'skip', label: '忽略' },
]

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map(o => [o.value, o.label]),
)

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}
