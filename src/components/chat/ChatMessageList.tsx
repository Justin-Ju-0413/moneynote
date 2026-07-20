import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '@/db/types'
import { TransactionCard } from './TransactionCard'

interface Props {
  messages: ChatMessage[]
  sending: boolean
  onConfirm: (id: number) => void
  onCancel: (id: number) => void
  aiEnabled: boolean
}

export function ChatMessageList({ messages, sending, onConfirm, onCancel, aiEnabled }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <p className="text-sm text-text-secondary mb-2">👋 你好,我是记账助手</p>
        <p className="text-xs text-text-muted leading-relaxed max-w-xs">
          {aiEnabled
            ? '直接说就行,比如"午餐35"、"本月花了多少"、"把刚才那笔改成20"。'
            : 'AI 未启用,可本地解析记账。在设置里配置 AI 后支持查询、修改、删除。'}
        </p>
      </div>
    )
  }

  return (
    <div className="py-4 space-y-3">
      {messages.map((m) =>
        m.id === undefined ? null : (
          <MessageBubble key={m.id} message={m} onConfirm={onConfirm} onCancel={onCancel} />
        ),
      )}
      {sending && (
        <div className="flex justify-start">
          <div className="bg-primary-50/50 border border-primary-200/40 px-3 py-2 text-xs text-text-muted">
            <span className="inline-block w-1.5 h-1.5 bg-primary-500 rounded-full mr-1.5 animate-pulse" />
            思考中…
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage
  onConfirm: (id: number) => void
  onCancel: (id: number) => void
}) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={isUser ? 'max-w-[85%]' : 'w-full max-w-[90%]'}>
        {message.content && (
          <motion.div
            className={`px-3 py-2 text-sm whitespace-pre-wrap break-words ${
              isUser ? 'bg-primary-600 text-bg' : 'bg-primary-50/50 border border-primary-200/40 text-text'
            }`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {message.content}
          </motion.div>
        )}
        {message.card && (
          <TransactionCard
            card={message.card}
            onConfirm={() => onConfirm(message.id!)}
            onCancel={() => onCancel(message.id!)}
          />
        )}
      </div>
    </div>
  )
}
