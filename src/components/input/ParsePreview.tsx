import { motion } from 'framer-motion'
import type { ParsedTransaction } from '@/db/types'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { CATEGORY_MAP } from '@/utils/constants'
import { formatDate } from '@/utils/format'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'

import type { LLMStatus } from '@/llm/types'

interface ParsePreviewProps {
  result: ParsedTransaction
  onConfirm: () => void
  onUpdate: (updates: Partial<ParsedTransaction>) => void
  llmStatus?: LLMStatus
  llmError?: string | null
}

const categories = Object.entries(CATEGORY_MAP)

export function ParsePreview({ result, onConfirm, onUpdate, llmStatus = 'idle', llmError }: ParsePreviewProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  return (
    <motion.div
      className="blue-border bg-bg p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
        <span className="text-[10px] tracking-[0.15em] uppercase text-primary-500 font-medium">解析结果</span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => setShowCategoryPicker(!showCategoryPicker)}>
          <CategoryIcon category={result.category} />
        </button>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            {result.amount !== null ? (
              <span className={`text-2xl font-heading ${result.type === 'income' ? 'text-green-600' : 'text-expense'}`}>
                {result.type === 'income' ? '+' : '-'}¥{result.amount.toFixed(2)}
              </span>
            ) : (
              <span className="text-sm text-text-muted">未识别金额</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-text-secondary">
              {CATEGORY_MAP[result.category]?.name || '其他'}
            </span>
            <span className="text-primary-300">·</span>
            <span className="text-xs text-text-muted">{formatDate(result.date)}</span>
            {result.time && (
              <>
                <span className="text-primary-300">·</span>
                <span className="text-xs text-text-muted">{result.time}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {result.note && (
        <p className="text-xs text-text-secondary mb-3 border-l-2 border-primary-300 pl-3">{result.note}</p>
      )}

      {/* 分类选择器 */}
      {showCategoryPicker && (
        <motion.div
          className="grid grid-cols-4 lg:grid-cols-5 gap-2 mb-3 p-3 border border-primary-200/50"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          {categories.map(([id, info]) => (
            <button
              key={id}
              className={`flex flex-col items-center gap-1 p-2 min-h-11 min-w-11 transition-colors ${
                result.category === id ? 'bg-primary-100/50 border border-primary-400' : 'hover:bg-primary-50/30 border border-transparent'
              }`}
              onClick={() => {
                onUpdate({ category: id })
                setShowCategoryPicker(false)
              }}
            >
              <span className="text-base">{info.icon}</span>
              <span className="text-[10px] text-text-secondary">{info.name}</span>
            </button>
          ))}
        </motion.div>
      )}

      {/* 金额修正 */}
      {result.needsReview && result.amount === null && (
        <div className="mb-3">
          <input
            type="number"
            placeholder="输入金额"
            className="w-full px-3 py-2 border border-primary-300 text-sm outline-none bg-transparent text-text"
            onChange={(e) => {
              const amount = parseFloat(e.target.value)
              if (!isNaN(amount)) {
                onUpdate({ amount, needsReview: false })
              }
            }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onConfirm} className="flex-1" disabled={result.amount === null}>
          确认记录
        </Button>
      </div>

      {result.needsReview && (
        <p className="text-[10px] tracking-widest uppercase text-primary-500 mt-3 text-center">
          ⚠ 部分信息需要确认
        </p>
      )}

      {/* LLM 解析来源标记 */}
      {llmStatus === 'loading' && (
        <p className="text-[10px] tracking-widest uppercase text-text-muted mt-3 text-center">
          <span className="inline-block w-1.5 h-1.5 bg-primary-500 rounded-full mr-1.5 animate-pulse" />
          AI 解析中...
        </p>
      )}
      {llmStatus === 'success' && (
        <p className="text-[10px] tracking-widest uppercase text-primary-600 mt-3 text-center">
          规则 + AI 优化
        </p>
      )}
      {llmStatus === 'error' && (
        <p className="text-[10px] tracking-widest uppercase text-[#c94040] mt-3 text-center">
          AI 解析失败{llmError ? `: ${llmError}` : ''}，使用规则结果
        </p>
      )}
    </motion.div>
  )
}
