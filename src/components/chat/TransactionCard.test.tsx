import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionCard } from './TransactionCard'
import type { ChatCard, Transaction } from '@/db/types'

function parsedCard(over: Partial<ChatCard> = {}): ChatCard {
  return {
    kind: 'record',
    status: 'pending',
    parsed: {
      amount: 15,
      amountConfidence: 'high',
      categoryConfidence: 'high',
      category: 'transport',
      date: '2026-01-15',
      time: null,
      note: '打车',
      rawInput: '打车15',
      type: 'expense',
      needsReview: false,
    },
    ...over,
  }
}

function snapshotTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 7,
    amount: 10,
    category: 'food',
    date: '2026-01-15',
    time: '12:30',
    note: '午餐',
    type: 'expense',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('TransactionCard', () => {
  it('record 待确认卡：金额/分类/备注/状态与确认取消按钮', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TransactionCard card={parsedCard()} onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('-¥15.00')).toBeInTheDocument()
    expect(screen.getByText('交通')).toBeInTheDocument()
    expect(screen.getByText('打车')).toBeInTheDocument()
    expect(screen.getByText('待确认 · 记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认记录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
  })

  it('确认与取消回调被触发', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TransactionCard card={parsedCard()} onConfirm={onConfirm} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: '确认记录' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('收入类型显示 + 号金额与 success 色', () => {
    render(
      <TransactionCard
        card={parsedCard({
          parsed: {
            amount: 200,
            amountConfidence: 'high',
            categoryConfidence: 'high',
            category: 'salary',
            date: '2026-01-15',
            time: null,
            note: '',
            rawInput: '工资200',
            type: 'income',
            needsReview: false,
          },
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const amount = screen.getByText('+¥200.00')
    expect(amount).toBeInTheDocument()
    expect(amount).toHaveClass('text-success')
  })

  it('已确认状态：显示已记录且不再渲染操作按钮', () => {
    render(
      <TransactionCard card={parsedCard({ status: 'confirmed' })} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByText('已记录')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('已取消状态：显示已取消', () => {
    render(
      <TransactionCard card={parsedCard({ status: 'cancelled' })} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByText('已取消')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('modify 卡：显示改前金额划线与新金额', () => {
    render(
      <TransactionCard
        card={{
          kind: 'modify',
          status: 'pending',
          txId: 7,
          snapshot: snapshotTx(),
          changes: { amount: 99 },
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('¥10.00')).toHaveClass('line-through')
    expect(screen.getByText('-¥99.00')).toBeInTheDocument()
    expect(screen.getByText('待确认 · 修改')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认修改' })).toBeInTheDocument()
  })

  it('delete 卡：确认按钮文案为确认删除', () => {
    render(
      <TransactionCard
        card={{ kind: 'delete', status: 'pending', txId: 7, snapshot: snapshotTx() }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('待确认 · 删除')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeInTheDocument()
  })

  it('无可展示数据时渲染为空（record 缺 parsed）', () => {
    const { container } = render(
      <TransactionCard card={{ kind: 'record', status: 'pending' }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('无备注时不渲染备注段落', () => {
    render(
      <TransactionCard
        card={parsedCard({
          parsed: {
            amount: 5,
            amountConfidence: 'high',
            categoryConfidence: 'high',
            category: 'other',
            date: '2026-01-15',
            time: null,
            note: '',
            rawInput: 'x5',
            type: 'expense',
            needsReview: false,
          },
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('-¥5.00')).toBeInTheDocument()
    expect(screen.queryByText('打车')).not.toBeInTheDocument()
  })
})
