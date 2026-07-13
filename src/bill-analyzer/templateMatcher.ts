import type { BillTemplate, TemplateFingerprint } from '@/db/types'
import { db } from '@/db'
import { BUILTIN_TEMPLATES } from './builtinTemplates'

export interface MatchResult {
  template: BillTemplate | null
  matchType: 'exact' | 'fuzzy' | 'builtin' | 'none'
  similarity?: number
}

// ── 三级模板匹配 ──

export async function matchTemplate(
  fingerprint: TemplateFingerprint,
  detectedSource?: string,
): Promise<MatchResult> {
  // Level 0: 内置模板 → 直接使用原始 columnMappings（硬编码值已验证，不做动态对齐）
  if (detectedSource) {
    const builtin = BUILTIN_TEMPLATES.find(t => t.source === detectedSource)
    if (builtin) {
      return {
        template: {
          ...builtin,
          headerRowIndex: fingerprint.headerRowIndex,
        },
        matchType: 'builtin',
        similarity: 1,
      }
    }
  }

  // Level 1: 精确匹配（headerHash）
  const exactMatch = await db.billTemplates
    .where('fingerprint')
    .equals(fingerprint.headerHash)
    .filter(t => !t.isBuiltIn) // 内置模板的 fingerprint 为空，跳过
    .first()

  if (exactMatch) {
    return {
      template: {
        ...exactMatch,
        headerRowIndex: fingerprint.headerRowIndex,
      },
      matchType: 'exact',
      similarity: 1,
    }
  }

  // Level 2: 模糊匹配（列数一致 + Jaccard 相似度）
  const allTemplates = await db.billTemplates
    .filter(t => !t.isBuiltIn)
    .toArray()

  let bestTemplate: BillTemplate | null = null
  let bestSimilarity = 0

  for (const tmpl of allTemplates) {
    if (tmpl.columnMappings.length !== fingerprint.headerTexts.length) continue

    const similarity = jaccardSimilarity(
      new Set(tmpl.columnMappings.map(m => m.normalizedHeader).filter(Boolean)),
      new Set(fingerprint.headerTexts.filter(Boolean)),
    )

    if (similarity >= 0.8 && similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestTemplate = tmpl
    }
  }

  if (bestTemplate) {
    return {
      template: {
        ...bestTemplate,
        headerRowIndex: fingerprint.headerRowIndex,
        columnMappings: alignColumnMappings(bestTemplate, fingerprint.headerTexts),
      },
      matchType: 'fuzzy',
      similarity: bestSimilarity,
    }
  }

  return { template: null, matchType: 'none' }
}

// ── 更新模板使用统计 ──

export async function updateTemplateUsage(template: BillTemplate): Promise<void> {
  if (!template.id) return
  try {
    await db.billTemplates.update(template.id, {
      importCount: template.importCount + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    })
  } catch { /* noop */ }
}

// ── 保存新模板 ──

export async function saveTemplate(template: Omit<BillTemplate, 'id'>): Promise<number> {
  const now = Date.now()
  const id = await db.billTemplates.add({
    ...template,
    createdAt: now,
    updatedAt: now,
  } as BillTemplate)
  return id as number
}

// ── 删除模板（仅自定义模板） ──

export async function deleteTemplate(id: number): Promise<void> {
  const template = await db.billTemplates.get(id)
  if (template?.isBuiltIn) {
    throw new Error('不能删除内置模板')
  }
  await db.billTemplates.delete(id)
}

// ── 获取所有模板 ──

export async function getAllTemplates(): Promise<BillTemplate[]> {
  return db.billTemplates.orderBy('importCount').reverse().toArray()
}

// ── 工具函数 ──

/** Jaccard 相似度：两个集合的交集/并集 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** 对齐列映射：按 actualHeaders 为每个 template mapping 重新查找 columnIndex（非破坏性） */
function alignColumnMappings(
  template: BillTemplate,
  actualHeaders: string[],
): typeof template.columnMappings {
  return template.columnMappings.map(m => {
    const newIndex = actualHeaders.indexOf(m.normalizedHeader)
    return newIndex >= 0 ? { ...m, columnIndex: newIndex } : m
  })
}
