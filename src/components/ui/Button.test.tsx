import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('渲染 children 文本', () => {
    render(<Button>保存</Button>)
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it.each([
    ['primary', 'bg-primary-600'],
    ['secondary', 'border-primary-400'],
    ['ghost', 'hover:bg-primary-50/50'],
    ['danger', 'text-danger'],
  ] as const)('variant=%s 包含对应类名', (variant, expectedClass) => {
    render(<Button variant={variant}>x</Button>)
    expect(screen.getByRole('button')).toHaveClass(expectedClass)
  })

  it.each([
    ['sm', 'min-h-9'],
    ['md', 'min-h-11'],
    ['lg', 'min-h-12'],
  ] as const)('size=%s 包含对应类名', (size, expectedClass) => {
    render(<Button size={size}>x</Button>)
    expect(screen.getByRole('button')).toHaveClass(expectedClass)
  })

  it('默认 variant=primary size=md', () => {
    render(<Button>x</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('bg-primary-600')
    expect(btn).toHaveClass('min-h-11')
  })

  it('userEvent 点击触发 onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>点我</Button>)
    await user.click(screen.getByRole('button', { name: '点我' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled 透传且点击不触发 onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>禁用</Button>)
    const btn = screen.getByRole('button', { name: '禁用' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass('disabled:opacity-40')
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('className 追加到默认类名之后', () => {
    render(<Button className="w-full extra-class">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('w-full', 'extra-class', 'rounded-button')
  })

  it('原生 button 属性透传（type/data-testid）', () => {
    render(<Button type="submit" data-testid="submit-btn">x</Button>)
    const btn = screen.getByTestId('submit-btn')
    expect(btn).toHaveAttribute('type', 'submit')
  })
})
