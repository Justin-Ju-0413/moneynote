import { useChat } from '@/hooks/useChat'
import { useTransactions } from '@/hooks/useTransactions'
import { ChatMessageList } from '@/components/chat/ChatMessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { formatAmountShort } from '@/utils/format'

export function HomePage() {
  const { messages, sending, sendMessage, confirmCard, cancelCard, aiEnabled } = useChat()
  const { todayExpense, monthExpense } = useTransactions()

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] lg:h-[calc(100dvh-2rem)]">
      {/* 精简头部 + 收支摘要 */}
      <div className="px-5 pt-5 pb-3 md:px-8 lg:px-10">
        <h1 className="font-heading text-lg text-text">记账</h1>
        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
          <span>
            今日 <span className="text-expense font-medium">{formatAmountShort(todayExpense)}</span>
          </span>
          <span className="text-primary-300">·</span>
          <span>
            本月 <span className="text-expense font-medium">{formatAmountShort(monthExpense)}</span>
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
    </div>
  )
}
