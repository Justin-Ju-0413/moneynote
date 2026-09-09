import { useState, useRef, type RefObject } from 'react'
import { bulkImportTransactions } from '@/db'
import { useToast } from '@/components/ui/toast-context'
import { useBillTemplateLearning } from '@/hooks/useBillTemplateLearning'
import type { BillTemplate, ColumnMapping } from '@/db/types'
import { parseBillFile, SOURCE_LABELS } from '@/utils/import'
import type { ParseResult } from '@/utils/import'
import { classifyBillRows } from '@/utils/billClassifier'
import { getAllTemplates } from '@/bill-analyzer/templateMatcher'
import type { LLMConfig } from '@/llm/types'
import type { ImportResultDetail } from '@/components/settings/ImportResultDialog'

interface UseBillImportOptions {
  /** 导入时注入解析/分类的 LLM 草稿配置（表单未保存也可用）；undefined 表示纯本地解析 */
  llmConfig: LLMConfig | undefined
  /** 隐藏文件选择器的 ref：由调用方创建并直接挂到 <input>，ref 不经返回对象传播（react-hooks/refs） */
  fileInputRef: RefObject<HTMLInputElement | null>
}

/**
 * 账单导入流程：文件选择 → 解析（含模板学习桥接）→ 分类 → 批量写入 → 结果详情。
 * 学习桥接：解析器请求学习时挂起 Promise，用户在 ColumnMappingDialog 确认后 resolve。
 */
export function useBillImport({ llmConfig, fileInputRef }: UseBillImportOptions) {
  const { showToast } = useToast()
  const learning = useBillTemplateLearning()
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importResult, setImportResult] = useState<ImportResultDetail | null>(null)
  const resolveCallbackRef = useRef<((template: BillTemplate | null) => void) | null>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setIsImporting(true)
    setImportProgress('解析文件...')
    try {
      // 1. 解析文件（含模板匹配 + 学习流程）
      const parseResult: ParseResult = await parseBillFile(file, {
        llmConfig,
        onLearnRequest: async (ctx) => {
          learning.startLearning(file, ctx)
          return new Promise<BillTemplate | null>((resolve) => {
            resolveCallbackRef.current = resolve
          })
        },
      })

      if (parseResult.rows.length === 0) {
        showToast('文件中没有可导入的记录', 'info')
        setIsImporting(false)
        setImportProgress('')
        return
      }

      // 查找匹配的模板
      let matchedTemplate: BillTemplate | undefined
      if (parseResult.templateId) {
        const templates = await getAllTemplates()
        matchedTemplate = templates.find(t => t.id === parseResult.templateId)
      }

      // 2. 分类映射
      setImportProgress(`本地分类中 (0/${parseResult.rows.length})`)
      const classifyResult = await classifyBillRows(parseResult.rows, {
        llmEnabled: !!llmConfig,
        llmConfig,
        template: matchedTemplate,
        onProgress: (p) => {
          const label = p.phase === 'llm_batch' ? 'AI 批量分类中' : '本地分类中'
          setImportProgress(`${label} (${p.current}/${p.total})`)
        },
      })

      if (classifyResult.transactions.length === 0) {
        showToast('所有记录均被过滤，无可导入数据', 'info')
        setIsImporting(false)
        setImportProgress('')
        return
      }

      // 3. 批量导入（去重）
      setImportProgress('写入数据库...')
      const result = await bulkImportTransactions(classifyResult.transactions)

      // 4. 结果反馈
      const sourceName = SOURCE_LABELS[parseResult.source] || parseResult.source
      showToast(`${sourceName} 导入完成，新增 ${result.imported} 笔`, 'success')

      setImportResult({
        sourceName,
        imported: result.imported,
        skipped: result.skipped,
        filtered: classifyResult.skippedCount,
        classifyResult,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败'
      showToast(msg, 'error')
    }
    setIsImporting(false)
    setImportProgress('')
  }

  // 学习回调：用户在 ColumnMappingDialog 中确认
  const handleLearningConfirm = async (name: string, mappings: ColumnMapping[]) => {
    const template = await learning.confirm(name, mappings)
    if (template && resolveCallbackRef.current) {
      resolveCallbackRef.current(template)
      resolveCallbackRef.current = null
    }
    learning.reset()
  }

  const handleLearningCancel = () => {
    if (resolveCallbackRef.current) {
      resolveCallbackRef.current(null)
      resolveCallbackRef.current = null
    }
    learning.cancel()
  }

  return {
    isImporting,
    importProgress,
    importResult,
    learning,
    openFilePicker: handleImportClick,
    onFileSelected: handleFileSelected,
    learningConfirm: handleLearningConfirm,
    learningCancel: handleLearningCancel,
    clearResult: () => setImportResult(null),
  }
}
