import { useState, useCallback, useRef } from 'react'
import type { BillTemplate, ColumnMapping } from '@/db/types'
import type { LearningContext } from '@/bill-analyzer/learningFlow'
import { contextToTemplate } from '@/bill-analyzer/learningFlow'
import { saveTemplate } from '@/bill-analyzer/templateMatcher'

export type LearningState =
  | { phase: 'idle' }
  | { phase: 'analyzing' }
  | { phase: 'confirming'; context: LearningContext }
  | { phase: 'saving'; context: LearningContext }
  | { phase: 'done'; template: BillTemplate }
  | { phase: 'error'; message: string }

export function useBillTemplateLearning() {
  const [state, setState] = useState<LearningState>({ phase: 'idle' })
  const fileRef = useRef<File | null>(null)

  const startLearning = useCallback((file: File, context: LearningContext) => {
    fileRef.current = file
    setState({ phase: 'confirming', context })
  }, [])

  const updateMappings = useCallback((mappings: ColumnMapping[]) => {
    if (state.phase !== 'confirming') return
    setState({
      phase: 'confirming',
      context: { ...state.context, columnMappings: mappings },
    })
  }, [state])

  const confirm = useCallback(async (name: string, mappings: ColumnMapping[]): Promise<BillTemplate | null> => {
    if (state.phase !== 'confirming') return null

    const ctx: LearningContext = { ...state.context, columnMappings: mappings }
    setState({ phase: 'saving', context: ctx })

    try {
      const templateData = contextToTemplate(ctx, name)
      const id = await saveTemplate(templateData)
      const template: BillTemplate = { ...templateData, id }

      setState({ phase: 'done', template })
      return template
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存模板失败'
      setState({ phase: 'error', message: msg })
      return null
    }
  }, [state])

  const cancel = useCallback(() => {
    fileRef.current = null
    setState({ phase: 'idle' })
  }, [])

  const reset = useCallback(() => {
    fileRef.current = null
    setState({ phase: 'idle' })
  }, [])

  return {
    state,
    file: fileRef.current,
    startLearning,
    updateMappings,
    confirm,
    cancel,
    reset,
  }
}
