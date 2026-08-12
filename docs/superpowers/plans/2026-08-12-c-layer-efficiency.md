# C 层第一批 · AI 效率与成本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ROADMAP v2 C 层第一批（用户已确认范围）：C3 成本可观测 + C2-a LLM 并发池 + C6 分类规则收敛。

**Architecture:**
- C3：`llmChat` 解析 `data.usage` → `LLMChatResult.usage` → `runTask`（唯一咽喉）统一记录到新表 `llmUsage`（DB v13）→ 设置页月度展示
- C2-a：抽 `runPool(items, concurrency, worker)` 纯工具（限流+保序+异常隔离）→ useAIWorkspace / billClassifier 分批并行（结果按下标回写，语义与串行一致）
- C6：删 `ALIPAY_CATEGORY_MAP`（与 builtinTemplates.sourceCategoryMap 逐字节重复）→ 通用模板驱动分支（修复死代码 `row.fields[columnIndex.toString()]` → 经 columnMappings 查 normalizedHeader）

**Tech Stack:** TypeScript / React 19 / Dexie / Vitest

## Global Constraints

- 不引入新依赖；E2E 既有用例零改动；usage 缺失（undefined）时零影响（不写表）
- 提交前 `npm run lint` + `npm test` + `npm run build` 通过；关键路径跑 `npm run test:e2e`
- 每任务一个 commit，同 commit 勾选本计划 + ROADMAP 对应条目

**记档（后续批）**：C1 Repository / C2-b（去重分桶、明细搜索分页）/ C4 json_schema（DeepSeek 官方不支持，需 provider 能力开关）/ C5 加密审计 / C7（BillSource string + OCR，需新依赖）。

---

### Task 1: C3 成本可观测

**Files:**
- Modify: `src/llm/client.ts`、`src/llm/task.ts`、`src/db/schema.ts`、`src/db/types.ts`、`src/pages/SettingsPage.tsx`
- Create: `src/llm/usage.ts`、`src/components/settings/LLMUsage.tsx`
- Test: `src/llm/client.test.ts`、`src/llm/task.test.ts`

- [x] **Step 1: client.ts** `LLMChatResult` 加 `usage?: { promptTokens: number; completionTokens: number; totalTokens: number }`；响应解析处读 `data.usage`（缺失 → undefined）
- [x] **Step 2: DB v13** `llmUsage: '++id, createdAt'`；`LlmUsage` 类型（task/model/promptTokens/completionTokens/totalTokens/createdAt）→ AppDBSchema
- [x] **Step 3: `src/llm/usage.ts`**：
  ```ts
  export async function recordLLMUsage(task: string, model: string, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): Promise<void>
  // usage 为空直接返回；try/catch 隔离（log.warn，不得影响识别链路）
  export async function listUsageBetween(start: number, end: number): Promise<LlmUsage[]>
  export async function cleanupLLMUsage(days = 90): Promise<number>
  ```
- [x] **Step 4: task.ts** `TaskRunResult` 加 `usage?`；runTask 透出 usage 并在返回前 `await recordLLMUsage(task.name, ctx.config.model, usage)`（统一咽喉）
- [x] **Step 5: UI** `src/components/settings/LLMUsage.tsx`（AI 智能解析 Card 内表单下方）：本月调用次数 + prompt/completion tokens；挂载时 cleanupLLMUsage(90)；SettingsPage 引入
- [x] **Step 6: 测试** client.test +1（带 usage 解析 / 不带 undefined）；task.test +2（usage 透出 / llmUsage 表落行含 task+model）
- [x] **Step 7: 验证 + 提交** `npm test` + lint + build → commit `feat: C3 成本可观测（llmUsage 表 v13 + usage 透传 + 设置页展示）`，勾选本 Task + ROADMAP C3

---

### Task 2: C2-a LLM 并发池

**Files:**
- Create: `src/utils/pool.ts` + `src/utils/pool.test.ts`
- Modify: `src/hooks/useAIWorkspace.ts`、`src/utils/billClassifier.ts`
- Test: `src/utils/billClassifier.test.ts`

- [x] **Step 1: `src/utils/pool.ts`**：
  ```ts
  export async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void>
  // 限流：最多 concurrency 个在飞；保序：worker 收到 index；单 worker 异常向上抛（调用方处理），其余继续；空数组直接返回
  ```
- [x] **Step 2: useAIWorkspace.ts** chunks 顺序循环 → `runPool(chunks, LLM_CONCURRENCY, ...)`（常量 2）；`all[i] = suggestions` 下标写回；进度按完成数
- [x] **Step 3: billClassifier.ts** 批次循环 → `runPool(batches, LLM_CONCURRENCY, ...)`；下标写回不变；进度按完成数
- [x] **Step 4: 测试** pool.test.ts（最大并发不超限 / 保序 / 单 worker 抛错不阻塞其余 / 空数组）；billClassifier.test.ts +1（并发下结果按位置正确回写）
- [x] **Step 5: 验证 + 提交** → commit `feat: C2-a LLM 并发池（runPool + AI 工作台/账单导入并行化）`，勾选本 Task + ROADMAP C2

---

### Task 3: C6 分类规则收敛

**Files:**
- Modify: `src/utils/billClassifier.ts`
- Test: `src/utils/billClassifier.test.ts`

- [ ] **Step 1: 删 `ALIPAY_CATEGORY_MAP`**（L31-54，21 条重复，真源在 builtinTemplates.sourceCategoryMap）
- [ ] **Step 2: 通用模板驱动分支**：替换 alipay 硬编码分支 + 死代码分支：
  ```ts
  // 第一级：模板 sourceCategoryMap（来源方自带分类标签 → 内部分类，数据驱动）
  const scm = options.template?.sourceCategoryMap
  if (scm && tx.category === 'other') {
    const header = options.template?.columnMappings.find((m) => m.columnIndex === scm.columnIndex)?.normalizedHeader
    const catVal = header ? row.fields[header] : ''
    if (catVal && scm.mapping[catVal]) tx.category = scm.mapping[catVal]
  }
  ```
  template 缺失时退化走匹配链（'其他' → other 与现状等价）
- [ ] **Step 3: 测试** +3（带 sourceCategoryMap 模板时映射生效 / 无 template 退化走匹配链 / columnIndex→normalizedHeader 解析正确）
- [ ] **Step 4: 验证 + 提交** → commit `feat: C6 分类规则收敛（删 ALIPAY_CATEGORY_MAP 重复 + 修复死代码分支）`，勾选本 Task + ROADMAP C6

---

### Task 4: 收尾

- [ ] **Step 1: PROGRESS.md** 记 2026-08-12 C 层第一批
- [ ] **Step 2: 全量验证** `npm run lint` + `npm test`（230 → ~240）+ `npm run build` + `npm run test:e2e`
- [ ] **Step 3: PR** → CI quality + e2e 双绿 → squash 合并 → 删分支 → 验证 main 同步

---

## Self-Review

**1. ROADMAP 覆盖核对：** C3（Task 1）/ C2（Task 2）/ C6（Task 3）全覆盖；C1/C4/C5/C7 记档后续批。
**2. 行为保持：** usage undefined 时不写表；并发池下标回写保证输出顺序与串行一致；E2E 零改动；内置模板入库有 id → 导入流程 matchedTemplate 恒可取 → C6 无回归。
**3. 已知风险：** runTask 内 await 记录会为每次 LLM 调用加一次 IndexedDB 写（~1ms，可接受）；并发度 2 可能略增 provider 限流概率（429 已有错误映射）；C6 的 sourceCategoryMap 依赖 template 传入（设置页流程恒传，直接调用 classifyBillRows 无 template 时退化走匹配链）。
