import { useState } from 'react'
import { useChat } from '@/hooks/useChat'
import { useTransactions } from '@/hooks/useTransactions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ChatMessageList } from '@/components/chat/ChatMessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { formatAmountShort } from '@/utils/format'

export function HomePage() {
  const { messages, sending, sendMessage, confirmCard, cancelCard, clearMessages, aiEnabled } = useChat()
  const { todayExpense, monthExpense, monthIncome } = useTransactions()
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] lg:h-[calc(100dvh-2rem)]">
      {/* 精简头部 + 收支摘要 */}
      <div className="px-5 pt-5 pb-3 md:px-8 lg:px-10">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-lg text-text">记账</h1>
          {messages.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[11px] text-text-muted hover:text-accent transition-colors shrink-0"
            >
              清空
            </button>
          )}
        </div>
        <div className="rounded-card shadow-card blue-border bg-bg mt-3 px-4 py-3 flex items-center gap-3 text-xs text-text-muted">
          <span>
            今日 <span className="text-expense font-medium tabular-nums">{formatAmountShort(todayExpense)}</span>
          </span>
          <span className="text-primary-300">·</span>
          <span>
            本月支 <span className="text-expense font-medium tabular-nums">{formatAmountShort(monthExpense)}</span>
          </span>
          <span className="text-primary-300">·</span>
          <span>
            收 <span className="text-income font-medium tabular-nums">{formatAmountShort(monthIncome)}</span>
          </span>
        </div>
      </div>

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 lg:px-10">
        <ChatMessageList
          messages={messages}
          sending={sending}
          onConfirm={confirmCard}
          onCancel={cancelCard}
          aiEnabled={aiEnabled}
        />
      </div>

      {/* 输入框 */}
      <div className="px-5 pb-3 md:px-8 lg:px-10">
        <ChatInput onSend={sendMessage} sending={sending} />
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="清空对话"
        message="清空全部对话记录？"
        confirmText="清空"
        danger
        onConfirm={() => { clearMessages(); setConfirmClear(false) }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
