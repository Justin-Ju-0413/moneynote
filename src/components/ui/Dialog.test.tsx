import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

// mock framer-motion：动画属性剥离为纯 div、AnimatePresence 直接渲染 children，
// 让「open 渲染/关闭卸载」与焦点管理（Esc/Tab 圈定/焦点归还）可确定性断言。
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const MotionDiv = (props: Record<string, unknown>) => {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...rest
    } = props
    return React.createElement('div', rest)
  }
  const AnimatePresence = (props: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, props.children)
  return { motion: { div: MotionDiv }, AnimatePresence }
})

function renderDialog(open: boolean, onClose: () => void) {
  return render(
    <Dialog open={open} onClose={onClose} title="测试标题">
      <button>甲</button>
      <button>乙</button>
    </Dialog>,
  )
}

describe('Dialog', () => {
  it('open 时渲染 role=dialog 面板、标题与 children', () => {
    renderDialog(true, vi.fn())
    const panel = screen.getByRole('dialog')
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAttribute('aria-label', '测试标题')
    expect(screen.getByRole('heading', { name: '测试标题' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '甲' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '乙' })).toBeInTheDocument()
  })

  it('open=false 时不渲染任何内容', () => {
    const { container } = renderDialog(false, vi.fn())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('无 title 时不渲染标题栏与关闭按钮', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <button>甲</button>
      </Dialog>,
    )
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-label')
  })

  it('按 Esc 触发 onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(true, onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击遮罩触发 onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    // 渲染片段第一个子元素是遮罩（fixed inset-0），第二个是面板
    const { container } = renderDialog(true, onClose)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.className).toContain('fixed')
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击标题栏关闭按钮触发 onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(true, onClose)
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('open 后焦点移入面板（tabIndex=-1）', () => {
    renderDialog(true, vi.fn())
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(panel)
  })

  it('Tab 在最后一个可聚焦元素处折回第一个（圈定在弹窗内）', async () => {
    const user = userEvent.setup()
    renderDialog(true, vi.fn())
    const last = screen.getByRole('button', { name: '乙' })
    last.focus()
    await user.tab()
    // 面板内第一个可聚焦元素是标题栏的「关闭」按钮，焦点不逃逸到弹窗外
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }))
  })

  it('Shift+Tab 在第一个可聚焦元素处折回最后一个', async () => {
    const user = userEvent.setup()
    renderDialog(true, vi.fn())
    screen.getByRole('button', { name: '关闭' }).focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '乙' }))
  })

  it('关闭后焦点归还到触发元素', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <>
        <button>外部触发器</button>
        <Dialog open={false} onClose={onClose} title="测试标题">
          <button>甲</button>
        </Dialog>
      </>,
    )
    const trigger = screen.getByRole('button', { name: '外部触发器' })
    await user.click(trigger)
    expect(document.activeElement).toBe(trigger)

    rerender(
      <>
        <button>外部触发器</button>
        <Dialog open onClose={onClose} title="测试标题">
          <button>甲</button>
        </Dialog>
      </>,
    )
    expect(document.activeElement).toBe(screen.getByRole('dialog'))

    rerender(
      <>
        <button>外部触发器</button>
        <Dialog open={false} onClose={onClose} title="测试标题">
          <button>甲</button>
        </Dialog>
      </>,
    )
    expect(document.activeElement).toBe(trigger)
  })
})
