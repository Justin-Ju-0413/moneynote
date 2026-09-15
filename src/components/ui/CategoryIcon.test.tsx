import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryIcon } from './CategoryIcon'
import { db } from '@/db'

describe('CategoryIcon', () => {
  beforeEach(async () => {
    await db.categories.clear()
  })

  it('内置分类渲染对应 lucide 图标（svg）与分类名 aria-label', () => {
    const { container } = render(<CategoryIcon category="food" />)
    const el = screen.getByRole('img', { name: '餐饮' })
    expect(el).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('未知分类渲染首字头像（无 svg）', () => {
    const { container } = render(<CategoryIcon category="custom-xyz" />)
    const el = screen.getByRole('img', { name: 'custom-xyz' })
    expect(el).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
    expect(el.textContent).toBe('c') // id 首字
  })

  it('数据库自定义分类渲染其名称首字头像', async () => {
    render(<CategoryIcon category="milk" />)
    expect(screen.getByRole('img', { name: 'milk' })).toBeInTheDocument()
    await db.categories.add({
      id: 'milk', name: '奶茶', icon: 'cup', color: '#ff00ff',
      keywords: [], sortOrder: 99, isBuiltIn: false, type: 'expense',
    })
    const el = await screen.findByRole('img', { name: '奶茶' })
    expect(el.textContent).toBe('奶')
  })

  it.each([
    ['sm', 'w-8'],
    ['md', 'w-10'],
    ['lg', 'w-12'],
  ] as const)('size=%s 应用对应容器类名', (size, expectedClass) => {
    render(<CategoryIcon category="food" size={size} />)
    expect(screen.getByRole('img')).toHaveClass(expectedClass)
  })
})
