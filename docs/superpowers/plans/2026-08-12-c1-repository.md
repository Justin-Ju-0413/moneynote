# C1 · Repository / 状态层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ROADMAP v2 C1（C 层最后一批）：引 repository 解耦 useLiveQuery 与业务，收敛重复查询与派生统计，为 D 层同步铺路。

**Architecture:** `src/db/repos/` 三个纯函数模块（transactions / categories / stats，命令式查询 + 写 + 统计纯函数，全部可单测）→ hook 与页面改调 repo（useLiveQuery 薄封装）；统计从 useMemo 提取为纯函数。

**Tech Stack:** TypeScript / React 19 / Dexie / Vitest

## Global Constraints

- 不引入新依赖；E2E 既有用例零改动；查询语义逐一对应（排序/limit/区间含端点）
- 提交前 `npm run lint` + `npm test` + `npm run build` 通过；关键路径跑 `npm run test:e2e`
- 每任务一个 commit，同 commit 勾选本计划 + ROADMAP C1

**记档（后续批）**：C7（BillSource string + OCR）；budgets/settings/chatMessages 等单 hook 专属表 repo 化（无重复收益，D 层同步时统一）。

---

### Task 1: repository 层

**Files:**
- Create: `src/db/repos/transactions.ts`、`src/db/repos/categories.ts`、`src/db/repos/stats.ts`、`src/db/repos/repository.test.ts`

- [x] **Step 1: transactions.ts**（命令式，全部可单测）：
  ```ts
  export function getRecentTransactions(limit = 10): Promise<Transaction[]>   // orderBy date reverse limit
  export function getTransactionsByDateRange(start: string, end: string): Promise<Transaction[]>  // where date between reverse
  export function getAllTransactions(): Promise<Transaction[]>                 // toArray
  export function getTransactionsByTypeInRange(type: 'expense'|'income', start: string, end: string): Promise<Transaction[]>  // [type+date] between
  export async function addTransaction(data: Omit<Transaction, 'id'|'createdAt'|'updatedAt'>): Promise<number>   // 补 createdAt/updatedAt
  export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<number>  // 补 updatedAt
  export async function deleteTransaction(id: number): Promise<void>
  export function countTransactionsByCategory(categoryId: string): Promise<number>  // where category count
  ```
- [x] **Step 2: categories.ts**：`getCategories()` / `addCategory` / `updateCategory` / `deleteCategory`（写逻辑从 useCategories 移入）
- [x] **Step 3: stats.ts**（纯函数，从 hook useMemo 原样提取）：
  ```ts
  export interface RangeStats { totalExpense; totalIncome; netIncome; byCategory; byCategoryIncome; byDate; count; incomeCount }
  export function computeRangeStats(txs: Transaction[]): RangeStats   // useStats L31-65 逻辑
  export function sumAmount(txs: Transaction[]): number               // reduce 求和
  ```
- [x] **Step 4: repository.test.ts**（fake-indexeddb）：recent 排序/limit、date range 含端点、type+date range、add/update 补时间戳、delete、countByCategory、computeRangeStats 聚合（多类型/分类/日期）、sumAmount
- [x] **Step 5: 验证 + 提交** `npm test` + lint → commit `feat: C1 repository 层（transactions/categories/stats 纯函数 + 单测）`，勾选本 Task

---

### Task 2: hook 收口（6 个）

**Files:** Modify: `useTransactions.ts`、`useStats.ts`、`useCategories.ts`、`useChat.ts`、`useDedup.ts`、`useAIWorkspace.ts`

- [x] **Step 1: useTransactions**：live 改调 repo（recent(10) / type+date×3）；写改调 repo；hook 不再暴露死代码 `getTransactionsByDateRange`
- [x] **Step 2: useStats**：live 改调 `getTransactionsByDateRange`；useMemo 换 `computeRangeStats`
- [x] **Step 3: useCategories**：live 改调 `getCategories`；写 + `isCategoryInUse` 改调 repo
- [x] **Step 4: useChat**：`buildContext` 5 次 db 访问改调 repo
- [x] **Step 5: useDedup / useAIWorkspace**：全表改调 `getAllTransactions`
- [x] **Step 6: 验证 + 提交** → commit `refactor: C1 hook 收口 repository（6 hook 去直接 db 访问）`，勾选本 Task

---

### Task 3: 页面收口（4 个）

**Files:** Modify: `BudgetPage.tsx`、`HistoryPage.tsx`、`AIWorkspacePage.tsx`、`SettingsPage.tsx`

- [x] **Step 1: BudgetPage**：monthSpending 改调 `getTransactionsByTypeInRange` + `computeRangeStats(txs).byCategory`（删页面内重复聚合）
- [x] **Step 2: HistoryPage**：分页 live 改调 repo（筛选态 `getAllTransactions` / 非筛选 `getRecentTransactions(visibleCount)`）
- [x] **Step 3: AIWorkspacePage**：全表 live 改调 `getAllTransactions`
- [x] **Step 4: SettingsPage**：导出用全表 live 改调 `getAllTransactions`
- [x] **Step 5: 验证 + 提交** → commit `refactor: C1 页面收口 repository（4 页面去直接 db 访问）`，勾选本 Task + ROADMAP C1

---

### Task 4: 收尾

- [ ] **Step 1: PROGRESS.md** 记 2026-08-12 C1
- [ ] **Step 2: 全量验证** `npm run lint` + `npm test`（258 → ~270）+ `npm run build` + `npm run test:e2e`
- [ ] **Step 3: PR** → CI quality + e2e 双绿 → squash 合并 → 删分支 → 验证 main 同步

---

## Self-Review

**1. ROADMAP 覆盖核对：** C1 全覆盖（Task 1-3）；C7 记档。
**2. 行为保持：** 查询语义逐一对应（排序/limit/含端点区间）；写时间戳补全不变；统计纯函数与现 useMemo 输出一致（单测锁定）；E2E 零改动。
**3. 已知风险：** hook 无测试（repo 函数已单测 + E2E 回归）；useChat buildContext 重构涉及上下文格式（E2E home-chat 覆盖）；死代码 `getTransactionsByDateRange` 从 hook 移除（repo 保留，无调用方）。
