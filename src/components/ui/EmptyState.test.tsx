import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('渲染标题', () => {
    render(<EmptyState title="暂无数据" />)
    expect(screen.getByRole('heading', { name: '暂无数据' })).toBeInTheDocument()
  })

  it('无描述时不渲染 p，有描述时渲染', () => {
    const { rerender } = render(<EmptyState title="空" />)
    expect(screen.queryByText('还没有记录')).not.toBeInTheDocument()
    rerender(<EmptyState title="空" description="还没有记录" />)
    expect(screen.getByText('还没有记录')).toBeInTheDocument()
  })

  it('默认渲染 Inbox 图标，自定义 icon 节点优先', () => {
    const { container, rerender } = render(<EmptyState title="空" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    rerender(<EmptyState title="空" icon={<span data-testid="custom-icon">★</span>} />)
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })
})
