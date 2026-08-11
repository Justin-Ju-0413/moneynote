# B 层 · 学习规则进化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把学习闭环做成可量化的产品价值（ROADMAP v2 B 层 4 任务）：匹配增强（B1）、冲突与衰减（B2）、效果可视化（B3）、独立导出/导入（B4）。

**Architecture:**
- B1：`classifyWithChain` 包含匹配段增强——`stripChannelPrefix` 归一化 + 核心词 ≥2 字下限 + 核心词长度优先；命中路径插桩计量
- B3 计量：`LearningRule` 加 `matchCount?`/`lastHitAt?`（无新索引，无需 DB version bump）；`recordRuleHit` 命中更新
- B2：抽 `deriveCoreWord`（promote/revoke 共用）；`revokeKeyword` 从分类 keywords 撤回；`deleteLearningRule`/manual 改判时撤回；llm→manual 升级 hitCount 重置 1；`cleanupColdRules` 手动清理
- B4：`exportLearningRules`/`importLearningRules`（JSON v1，merchant 已存在**跳过**——用户已确认）；UI 复用 `downloadFile` + 隐藏 fileInput 模式

**Tech Stack:** TypeScript / React 19 / Dexie / Vitest / Playwright

## Global Constraints

- 不引入新依赖；不改 E2E 既有用例内容（仅扩展）；`matchLearningRule` 精确契约不动（测试锁定）
- 提交前 `npm run lint` + `npm test` + `npm run build` 通过；关键路径跑 `npm run test:e2e`
- 每任务一个 commit，同 commit 勾选本计划 + ROADMAP 对应条目

**已知设计结论（探索验证，记档）**：
1. 包含匹配已存在于 `matchChain.ts:32-39`（`text.includes(rule.merchant)` + 最长优先），B1 只做增强
2. 「llm 规则被 manual 推翻 N 次降级」在当前模型下无场景——manual 覆盖即永久 manual（`recordLearning` L30 守卫），不做推翻计数
3. 核心词派生索引不做——规则量小（几十~几百条），全表 filter + 内存计算足够
4. 月度命中统计不做（需时间序列表，留给 C2 成本可观测）

---

### Task 1: B1 匹配增强 + B3 命中计量

**Files:**
- Modify: `src/db/types.ts`（LearningRule 加字段）、`src/nlp/matchChain.ts`、`src/nlp/learningRules.ts`
- Test: `src/nlp/matchChain.test.ts`、`src/nlp/learningRules.test.ts`

- [x] **Step 1: 类型** `LearningRule` 追加：
  ```ts
  matchCount?: number   // 累计命中次数（B3 计量；旧数据 undefined）
  lastHitAt?: number    // 最近命中时间戳
  ```
- [x] **Step 2: `recordRuleHit`**（learningRules.ts）：
  ```ts
  // 命中计量：matchCount+1 / lastHitAt=now；失败仅告警，不得打断识别
  export async function recordRuleHit(rule: LearningRule): Promise<void> {
    try {
      await db.learningRules.update(rule.id!, { matchCount: (rule.matchCount ?? 0) + 1, lastHitAt: Date.now() })
    } catch (err) { log.warn('规则命中计量失败', err) }
  }
  ```
- [x] **Step 3: matchChain.ts 包含匹配段重构**（保持精确优先）：
  ```ts
  let rule = await matchLearningRule(text)
  if (!rule) {
    const candidates = await db.learningRules.filter((r) => {
      if (!r.merchant) return false
      const core = stripChannelPrefix(r.merchant)
      if (core.length < 2) return false   // 单字规则不参与包含匹配（防误命中）
      return text.includes(core) || text.includes(r.merchant)
    }).toArray()
    if (candidates.length > 0) {
      candidates.sort((a, b) => stripChannelPrefix(b.merchant).length - stripChannelPrefix(a.merchant).length)
      rule = candidates[0]
    }
  }
  if (rule) {
    await recordRuleHit(rule)   // B3 计量（await 保证测试确定性）
    return { category: rule.category, confidence: 'high', matchedKeyword: rule.merchant, rule }
  }
  ```
- [x] **Step 4: 测试**
  - `matchChain.test.ts` +4：前缀规则命中（规则「财付通-美团」→输入「美团外卖」）；单字规则不命中（「餐」规则 vs「早餐店」文本）；命中后 matchCount/lastHitAt 更新（await 后断言 db 行）；核心词长度优先（「星巴克」vs「星巴克咖啡」取长）
  - `learningRules.test.ts` +2：recordRuleHit 累加（两次 → 2）；undefined 起始（matchCount ?? 0）
- [x] **Step 5: 验证 + 提交**：`npm test` + lint + build → commit `feat: B1 匹配增强 + B3 命中计量（matchCount/lastHitAt）`，勾选本 Task + ROADMAP B1/B3

---

### Task 2: B2 规则冲突与衰减

**Files:**
- Modify: `src/nlp/learningRules.ts`
- Test: `src/nlp/learningRules.test.ts`

- [x] **Step 1: 抽 `deriveCoreWord`**（promoteToKeyword 的核心词计算独立出来，promote/revoke 共用）：
  ```ts
  export function deriveCoreWord(merchant: string, category: string): string {
    let core = stripChannelPrefix(merchant)
    const suffixes = SUFFIX_DICT[category] ?? []
    let changed = true
    while (changed) { changed = false; for (const s of suffixes) { if (core.endsWith(s)) { core = core.slice(0, -s.length).trim(); changed = true; break } } }
    return core
  }
  ```
- [x] **Step 2: `revokeKeyword(rule): Promise<boolean>`** —— deriveCoreWord 结果在 `category.keywords` 中则移除（updateCategory 式 update），不存在返回 false
- [x] **Step 3: 行为改造**
  - `deleteLearningRule(id)`：先 `get(id)` → 删除 → `revokeKeyword`（有规则才撤回）
  - `recordLearning`：manual 且 `existing.category !== category` → 先从旧分类 `revokeKeyword({...existing, category: existing.category})`，再 promoteToKeyword(merged)；**llm→manual 升级时 `hitCount: 1`**（语义 = 用户确认次数；测试未锁定旧值，安全）
  - 新增 `cleanupColdRules(days = 180): Promise<number>` —— `listLearningRules()` 过滤 `lastHitAt && lastHitAt < Date.now() - days*86400e3`，逐条 delete（无 lastHitAt 不删，保守）；返回删除数
- [x] **Step 4: 测试** `learningRules.test.ts` +6：delete 撤回关键词（先提炼后删 → keywords 移除）；manual 改判撤回旧分类词 + 新分类提炼；llm→manual hitCount 重置 1；cleanupColdRules 删旧命中/留新命中 ×2；revokeKeyword 无词时 noop
- [x] **Step 5: 验证 + 提交**：`npm test` + lint → commit `feat: B2 规则冲突与衰减（关键词撤回 + hitCount 语义 + 冷规则清理）`，勾选本 Task + ROADMAP B2

---

### Task 3: B3 学习效果可视化（UI）

**Files:**
- Modify: `src/components/settings/LearningRulesManager.tsx`
- Test: `e2e/specs/learning.spec.ts`

- [ ] **Step 1: 统计条**（Card 内标题下）：
  ```tsx
  const total = rules.length
  const hits = rules.reduce((s, r) => s + (r.matchCount ?? 0), 0)
  // 「N 条规则 · 累计命中 X 次 · 约节省 X 次 LLM 调用」（命中一次即避免一次 LLM/低置信度 Review，近似口径）
  ```
- [ ] **Step 2: 行渲染**补：`{r.matchCount ?? 0} 次命中` + 最近命中时间 `new Date(r.lastHitAt ?? r.updatedAt).toLocaleString()`（对齐备份列表 L613 写法）
- [ ] **Step 3: 冷规则清理按钮**：「清理 180 天未命中规则」→ ConfirmDialog（组件内 state + 复用 `src/components/ui/ConfirmDialog`）→ `cleanupColdRules()` → toast「已清理 N 条冷规则」
- [ ] **Step 4: E2E** `learning.spec.ts`：进入设置页后断言 `getByText(/条规则/)` 可见
- [x] **Step 5: 验证 + 提交**：`npm test` + lint + build + `npm run test:e2e` → commit `feat: B3 学习效果可视化（统计条 + 命中次数 + 冷规则清理入口）`，勾选本 Task

---

### Task 4: B4 学习规则独立导出/导入

**Files:**
- Modify: `src/nlp/learningRules.ts`、`src/components/settings/LearningRulesManager.tsx`
- Test: `src/nlp/learningRulesExport.test.ts`（新建）、`e2e/specs/learning.spec.ts`

**用户已确认**：导入冲突策略 = 跳过已存在（按 merchant）。

- [ ] **Step 1: 导出/导入服务**（learningRules.ts）：
  ```ts
  export interface LearningRulesExport { version: 1; exportedAt: number; rules: LearningRule[] }
  export async function exportLearningRules(): Promise<string>       // JSON.stringify({version:1, exportedAt, rules})
  export async function importLearningRules(json: string): Promise<{ imported: number; skipped: number }>
  // 解析：非法 JSON / 非对象 / version !== 1 → throw；逐条：merchant trim 空跳过；已存在（where('merchant').equals）跳过；
  // 新增行复制字段（不含 id），source 非法值兜底 'manual'？——不，非法 source 跳过
  ```
- [ ] **Step 2: UI**（LearningRulesManager 内）：
  - 「导出」按钮 → `downloadFile(await exportLearningRules(), `moneynote-learning-rules_${date}.json`, 'application/json')`（复用 `src/utils/export.ts` downloadFile）
  - 「导入」按钮 → 隐藏 file input（accept=".json"）→ `file.text()` → `importLearningRules` → toast「导入 N 条，跳过 M 条」（失败 toast error）
  - 卡片描述补隐私提示：「规则含消费习惯，导出文件请妥善保管」
- [ ] **Step 3: 测试** `learningRulesExport.test.ts` +4：roundtrip 保真（导出→清空→导入→字段一致）；已存在跳过（imported/skipped 计数）；非法 JSON 抛错；version 不符抛错
- [ ] **Step 4: E2E** 补「导出触发下载」：点击导出按钮 → `page.waitForEvent('download')` → 断言 suggestedFilename 含 `learning-rules`
- [x] **Step 5: 验证 + 提交**：`npm test` + lint + build + `npm run test:e2e` → commit `feat: B4 学习规则独立导出/导入（跳过已存在）`，勾选本 Task + ROADMAP B4

---

### Task 5: 收尾

- [ ] **Step 1: PROGRESS.md** 记 2026-08-11 B 层迭代
- [ ] **Step 2: 全量验证** `npm run lint` + `npm test`（212 → ~228）+ `npm run build` + `npm run test:e2e`
- [ ] **Step 3: PR** → CI quality + e2e 双绿 → squash 合并 → 删分支 → 验证 main 同步

---

## Self-Review

**1. ROADMAP 覆盖核对：** B1（Task 1）/ B2（Task 2）/ B3（Task 3）/ B4（Task 4）全覆盖；用户已确认 B4 跳过策略与 B2 手动清理。
**2. 行为保持：** `matchLearningRule` 精确契约不动；`promoteToKeyword` 提炼逻辑不变（只抽公共函数）；E2E 既有用例零改动（仅扩展）。
**3. 已知风险：** 命中计量为每命中一次 DB 写（批量导入千条级可接受，已 try/catch 隔离）；旧数据无 matchCount/lastHitAt 时 UI 用 `?? 0`/`?? updatedAt` 兜底；`cleanupColdRules` 默认不删无 lastHitAt 的旧规则（保守）。
