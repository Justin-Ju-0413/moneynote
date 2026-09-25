import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement, createRef } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBillImport } from './useBillImport'
import { ToastContext } from '@/components/ui/toast-context'
import { bulkImportTransactions } from '@/db'
import { parseBillFile } from '@/utils/import'
import { classifyBillRows } from '@/utils/billClassifier'
import type { ParseResult, RawBillRow } from '@/utils/import'
import type { LearningContext } from '@/bill-analyzer/learningFlow'
import type { BillTemplate } from '@/db/types'

// 重逻辑（解析/分类/写入）已在纯函数层覆盖，此处 mock 边界、只测 hook 状态编排
vi.mock('@/utils/import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/import')>()
  return { ...actual, parseBillFile: vi.fn() }
})
vi.mock('@/utils/billClassifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/billClassifier')>()
  return { ...actual, classifyBillRows: vi.fn() }
})
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return { ...actual, bulkImportTransactions: vi.fn() }
})

const parseBillFileMock = vi.mocked(parseBillFile)
const classifyBillRowsMock = vi.mocked(classifyBillRows)
const bulkImportMock = vi.mocked(bulkImportTransactions)

const rows: RawBillRow[] = [
  { source: 'alipay', fields: { amount: '25', note: '咖啡' } },
  { source: 'alipay', fields: { amount: '30', note: '午餐' } },
]

function parseResult(over: Partial<ParseResult> = {}): ParseResult {
  return { source: 'alipay', rows, totalRows: rows.length, ...over }
}

function emptyClassifyResult(transactions: { amount: number; category: string; date: string; type: 'expense' | 'income'; note: string }[]) {
  return {
    transactions,
    skippedCount: 0,
    skipReasons: {},
    llmUsedCount: 0,
    llmFailedCount: 0,
    cacheHitCount: 0,
    learningCount: 0,
  }
}

function makeFile(): File {
  return new File(['a,b\n1,2'], 'bill.csv', { type: 'text/csv' })
}

// 最小可用的学习上下文（contextToTemplate 需读 fingerprint 等字段）
const learnCtx: LearningContext = {
  grid: [['日期', '金额']],
  fileType: 'csv',
  fingerprint: { fileType: 'csv', headerRowIndex: 0, headerHash: 'hash-1', columnCount: 2, headerTexts: ['日期', '金额'] },
  headers: ['日期', '金额'],
  rawHeaders: ['日期', '金额'],
  columnTypes: ['date', 'number'],
  columnRoles: ['date', 'amount'],
  columnMappings: [],
  filterRules: [],
  preview: [],
  warnings: [],
  suggestedName: '自定义模板',
  buildClassifyTextFrom: [],
}

function fileEvent(file: File | null): React.ChangeEvent<HTMLInputElement> {
  return { target: { files: file ? [file] : [], value: 'C:/fake/path' } } as unknown as React.ChangeEvent<HTMLInputElement>
}

function setup() {
  const showToast = vi.fn()
  const fileInputRef = createRef<HTMLInputElement>()
  const wrapper = (props: { children?: React.ReactNode }) =>
    createElement(ToastContext.Provider, { value: { showToast } }, props.children)
  const utils = renderHook(() => useBillImport({ llmConfig: undefined, fileInputRef }), { wrapper })
  return { ...utils, showToast, fileInputRef }
}

describe('useBillImport', () => {
  beforeEach(() => {
    parseBillFileMock.mockReset()
    classifyBillRowsMock.mockReset()
    bulkImportMock.mockReset()
  })

  it('openFilePicker 触发隐藏 input 的 click', () => {
    const input = document.createElement('input')
    const clickSpy = vi.spyOn(input, 'click')
    const showToast = vi.fn()
    const fileInputRef = createRef<HTMLInputElement>()
    fileInputRef.current = input
    const { result } = renderHook(() => useBillImport({ llmConfig: undefined, fileInputRef }), {
      wrapper: (p: { children?: React.ReactNode }) =>
        createElement(ToastContext.Provider, { value: { showToast } }, p.children),
    })
    act(() => result.current.openFilePicker())
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('未选择文件直接返回，不进入导入流程', async () => {
    const r = setup()
    await act(async () => { await r.result.current.onFileSelected(fileEvent(null)) })
    expect(parseBillFileMock).not.toHaveBeenCalled()
    expect(r.result.current.isImporting).toBe(false)
  })

  it('解析结果为空 → info 提示且不写库', async () => {
    parseBillFileMock.mockResolvedValue(parseResult({ rows: [], totalRows: 0 }))
    const r = setup()
    await act(async () => { await r.result.current.onFileSelected(fileEvent(makeFile())) })
    expect(parseBillFileMock).toHaveBeenCalledTimes(1)
    expect(r.showToast).toHaveBeenCalledWith('文件中没有可导入的记录', 'info')
    expect(bulkImportMock).not.toHaveBeenCalled()
    expect(r.result.current.isImporting).toBe(false)
    expect(r.result.current.importProgress).toBe('')
    expect(r.result.current.importResult).toBeNull()
  })

  it('成功路径：进度文案流转（解析→分类→写入）+ importResult 汇总', async () => {
    const r = setup()
    let releaseParse!: (v: ParseResult) => void
    let releaseClassify!: () => void
    let releaseBulk!: (v: { imported: number; skipped: number }) => void
    parseBillFileMock.mockImplementation(() => new Promise<ParseResult>((res) => { releaseParse = res }))
    classifyBillRowsMock.mockImplementation(async (_rows, opts) => {
      opts?.onProgress?.({ phase: 'classifying', current: 1, total: 2 })
      await new Promise<void>((res) => { releaseClassify = res })
      return {
        ...emptyClassifyResult([
          { amount: 25, category: 'food', date: '2026-09-01', type: 'expense' as const, note: '咖啡' },
          { amount: 30, category: 'food', date: '2026-09-01', type: 'expense' as const, note: '午餐' },
        ]),
        skippedCount: 1,
        skipReasons: { ignored: 1 },
      }
    })
    bulkImportMock.mockImplementation(() => new Promise<{ imported: number; skipped: number }>((res) => { releaseBulk = res }))

    let sending: Promise<void> | undefined
    act(() => { sending = r.result.current.onFileSelected(fileEvent(makeFile())) })
    await waitFor(() => expect(r.result.current.importProgress).toBe('解析文件...'))
    expect(r.result.current.isImporting).toBe(true)

    await act(async () => { releaseParse(parseResult()) })
    await waitFor(() => expect(r.result.current.importProgress).toBe('本地分类中 (1/2)'))

    await act(async () => { releaseClassify() })
    await waitFor(() => expect(r.result.current.importProgress).toBe('写入数据库...'))

    await act(async () => { releaseBulk({ imported: 2, skipped: 1 }) })
    await act(async () => { await sending })

    expect(bulkImportMock).toHaveBeenCalledTimes(1)
    expect(bulkImportMock.mock.calls[0][0]).toHaveLength(2)
    expect(r.showToast).toHaveBeenCalledWith('支付宝 导入完成，新增 2 笔', 'success')
    expect(r.result.current.isImporting).toBe(false)
    expect(r.result.current.importProgress).toBe('')
    expect(r.result.current.importResult).toMatchObject({
      sourceName: '支付宝', imported: 2, skipped: 1, filtered: 1,
    })
  })

  it('llm_batch 阶段进度文案映射为 AI 批量分类中', async () => {
    const r = setup()
    let releaseClassify!: () => void
    parseBillFileMock.mockResolvedValue(parseResult())
    classifyBillRowsMock.mockImplementation(async (_rows, opts) => {
      opts?.onProgress?.({ phase: 'llm_batch', current: 0, total: 5 })
      await new Promise<void>((res) => { releaseClassify = res })
      return emptyClassifyResult([])
    })

    let sending: Promise<void> | undefined
    act(() => { sending = r.result.current.onFileSelected(fileEvent(makeFile())) })
    await waitFor(() => expect(r.result.current.importProgress).toBe('AI 批量分类中 (0/5)'))
    await act(async () => { releaseClassify() })
    await act(async () => { await sending })

    // 全部记录被过滤 → info 提示、不写库
    expect(r.showToast).toHaveBeenCalledWith('所有记录均被过滤，无可导入数据', 'info')
    expect(bulkImportMock).not.toHaveBeenCalled()
    expect(r.result.current.importResult).toBeNull()
  })

  it('解析抛错 → error 提示且状态复位', async () => {
    parseBillFileMock.mockRejectedValue(new Error('文件格式无法识别'))
    const r = setup()
    await act(async () => { await r.result.current.onFileSelected(fileEvent(makeFile())) })
    expect(r.showToast).toHaveBeenCalledWith('文件格式无法识别', 'error')
    expect(r.result.current.isImporting).toBe(false)
    expect(r.result.current.importProgress).toBe('')
  })

  it('clearResult 重置结果', async () => {
    parseBillFileMock.mockResolvedValue(parseResult())
    classifyBillRowsMock.mockResolvedValue(emptyClassifyResult([
      { amount: 25, category: 'food', date: '2026-09-01', type: 'expense', note: '咖啡' },
    ]))
    bulkImportMock.mockResolvedValue({ imported: 1, skipped: 0 })
    const r = setup()
    await act(async () => { await r.result.current.onFileSelected(fileEvent(makeFile())) })
    expect(r.result.current.importResult).not.toBeNull()
    act(() => r.result.current.clearResult())
    expect(r.result.current.importResult).toBeNull()
  })

  it('学习桥接：确认映射后 resolve 模板并完成导入', async () => {
    const r = setup()
    let resolvedName: string | undefined
    parseBillFileMock.mockImplementation(async (_file, opts) => {
      const t = await opts?.onLearnRequest?.(learnCtx)
      resolvedName = t?.name
      return t ? parseResult({ templateId: t.id }) : parseResult()
    })
    classifyBillRowsMock.mockResolvedValue(emptyClassifyResult([
      { amount: 25, category: 'food', date: '2026-09-01', type: 'expense', note: '咖啡' },
    ]))
    bulkImportMock.mockResolvedValue({ imported: 1, skipped: 0 })

    let sending: Promise<void> | undefined
    act(() => { sending = r.result.current.onFileSelected(fileEvent(makeFile())) })
    // 解析请求学习 → hook 挂起等待用户确认映射；此时尚未走到分类/写库
    await waitFor(() => expect(r.result.current.learning.state.phase).toBe('confirming'))
    expect(bulkImportMock).not.toHaveBeenCalled()

    await act(async () => { await r.result.current.learningConfirm('我的支付宝', []) })
    await act(async () => { await sending })
    // learning.confirm 用上下文新建模板（saveTemplate 落库）→ resolve 回解析器
    expect(resolvedName).toBe('我的支付宝')
    expect(bulkImportMock).toHaveBeenCalledTimes(1)
    expect(r.result.current.importResult?.imported).toBe(1)
  })

  it('学习桥接：取消 resolve null 仍继续导入', async () => {
    const r = setup()
    let resolvedWith: BillTemplate | null | undefined
    parseBillFileMock.mockImplementation(async (_file, opts) => {
      resolvedWith = await opts?.onLearnRequest?.(learnCtx)
      return parseResult()
    })
    classifyBillRowsMock.mockResolvedValue(emptyClassifyResult([
      { amount: 25, category: 'food', date: '2026-09-01', type: 'expense', note: '咖啡' },
    ]))
    bulkImportMock.mockResolvedValue({ imported: 1, skipped: 0 })

    let sending: Promise<void> | undefined
    act(() => { sending = r.result.current.onFileSelected(fileEvent(makeFile())) })
    await waitFor(() => expect(r.result.current.learning.state.phase).toBe('confirming'))
    act(() => r.result.current.learningCancel())
    await act(async () => { await sending })
    expect(resolvedWith).toBeNull()
    expect(bulkImportMock).toHaveBeenCalledTimes(1)
  })
})
