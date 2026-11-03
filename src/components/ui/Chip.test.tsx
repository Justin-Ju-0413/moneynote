import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from './Chip'

describe('Chip', () => {
  it('渲染 children 且 aria-pressed 反映激活态', () => {
    const { rerender } = render(<Chip active onClick={vi.fn()}>餐饮</Chip>)
    expect(screen.getByRole('button', { name: '餐饮' })).toHaveAttribute('aria-pressed', 'true')
    rerender(<Chip active={false} onClick={vi.fn()}>餐饮</Chip>)
    expect(screen.getByRole('button', { name: '餐饮' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('激活实底 / 未激活描边类名区分', () => {
    const { rerender } = render(<Chip active onClick={vi.fn()}>x</Chip>)
    expect(screen.getByRole('button')).toHaveClass('bg-primary-600')
    rerender(<Chip active={false} onClick={vi.fn()}>x</Chip>)
    expect(screen.getByRole('button')).not.toHaveClass('bg-primary-600')
    expect(screen.getByRole('button')).toHaveClass('border')
  })

  it('userEvent 点击触发 onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Chip active={false} onClick={onClick}>筛选</Chip>)
    await user.click(screen.getByRole('button', { name: '筛选' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('touch 尺寸应用 44px 触摸高度类名', () => {
    render(<Chip active onClick={vi.fn()} size="touch">x</Chip>)
    expect(screen.getByRole('button')).toHaveClass('min-h-11')
  })
})
