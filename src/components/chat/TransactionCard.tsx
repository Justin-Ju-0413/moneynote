import { motion } from 'framer-motion'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { useCategories } from '@/hooks/useCategories'
import { formatDate } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import type { ChatCard } from '@/db/types'

interface Props {
  card: ChatCard
  onConfirm: () => void
  onCancel: () => void
}

const KIND_LABEL: Record<ChatCard['kind'], string> = {
  record: '记录',
  modify: '修改',
  delete: '删除',
}

interface Display {
  amount: number
  type: string
  category: string
  date: string
  time?: string | null
  note?: string
}

export function TransactionCard({ card, onConfirm, onCancel }: Props) {
  const { getInfo } = useCategories()
  const pending = card.status === 'pending'

  let display: Display | null = null
  let beforeAmount: number | undefined

  if (card.kind === 'record' && card.parsed) {
    display = {
      amount: card.parsed.amount ?? 0,
      type: card.parsed.type,
      category: card.parsed.category,
      date: card.parsed.date,
      time: card.parsed.time,
      note: card.parsed.note,
    }
  } else if (card.kind === 'modify' && card.snapshot) {
    const s = card.snapshot
    display = {
      amount: card.changes?.amount ?? s.amount,
      type: card.changes?.type ?? s.type,
      category: card.changes?.category ?? s.category,
      date: card.changes?.date ?? s.date,
      time: card.changes?.time ?? s.time,
      note: card.changes?.note ?? s.note,
    }
    if (card.changes?.amount !== undefined && card.changes.amount !== s.amount) beforeAmount = s.amount
  } else if (card.kind === 'delete' && card.snapshot) {
    display = {
      amount: card.snapshot.amount,
      type: card.snapshot.type,
      category: card.snapshot.category,
      date: card.snapshot.date,
      time: card.snapshot.time,
      note: card.snapshot.note,
    }
  }

  if (!display) return null

  const catName = getInfo(display.category).name
  const income = display.type === 'income'
  const statusText =
    card.status === 'confirmed'
      ? `已${KIND_LABEL[card.kind]}`
      : card.status === 'cancelled'
        ? '已取消'
        : `待确认 · ${KIND_LABEL[card.kind]}`

  return (
    <motion.div
      className="blue-border bg-bg p-3 mt-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
        <span className="text-[10px] tracking-[0.15em] uppercase text-primary-500 font-medium">{statusText}</span>
      </div>

      <div className="flex items-center gap-3">
        <CategoryIcon category={display.category} size="sm" />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            {beforeAmount !== undefined && (
              <span className="text-xs text-text-muted line-through">¥{beforeAmount.toFixed(2)}</span>
            )}
            <span className={`text-xl font-heading ${income ? 'text-green-600' : 'text-expense'}`}>
              {income ? '+' : '-'}¥{display.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-text-secondary">{catName}</span>
            <span className="text-primary-300">·</span>
            <span className="text-xs text-text-muted">{formatDate(display.date)}</span>
          </div>
        </div>
      </div>

      {display.note && (
        <p className="text-xs text-text-secondary mt-2 border-l-2 border-primary-300 pl-3">{display.note}</p>
      )}

      {pending && (
        <div className="flex gap-2 mt-3">
          <Button
            onClick={onConfirm}
            variant={card.kind === 'delete' ? 'danger' : 'primary'}
            size="sm"
            className="flex-1"
          >
            确认{KIND_LABEL[card.kind]}
          </Button>
          <Button onClick={onCancel} variant="ghost" size="sm" className="flex-1">取消</Button>
        </div>
      )}
    </motion.div>
  )
}
