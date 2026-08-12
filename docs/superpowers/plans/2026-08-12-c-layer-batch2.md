# C 层第二批 · 去重与搜索性能 + 加密审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ROADMAP v2 C 层第二批（用户已确认范围）：C2-b（去重剪枝修复 + 时间窗分桶 + 明细筛选分页/防抖）+ C5（威胁模型文档 + decrypt 失败显式化）。

**Architecture:**
- C2-b-1：`detectDuplicates` 模糊阶段按时间窗键分桶（O(n²) → 桶内），组内 amount 升序 + **同号剪枝守卫**（修复跨零 V 形非单调导致的漏对 bug）
- C2-b-2：`filterTransactions` 纯函数抽取 + 筛选态 `.slice(0, visibleCount)` 分页 + 触底加载 + 300ms 搜索防抖
- C5：威胁模型文档（docs/specs/）+ `decryptApiKey` 失败显式化（抛错，不再静默 `''`）+ useLLMSettings try/catch

**Tech Stack:** TypeScript / React 19 / Vitest

## Global Constraints

- 不引入新依赖；E2E 既有用例零改动；dedup 精确对仍 pairs[0]（测试锁定）
- 提交前 `npm run lint` + `npm test` + `npm run build` 通过；关键路径跑 `npm run test:e2e`
- 每任务一个 commit，同 commit 勾选本计划 + ROADMAP 对应条目

**记档（后续批）**：C1 Repository / C7（BillSource string：剩余 pingan 2 处硬编码已确认——billClassifier L203 过滤 + L306 文案构建；OCR 需新依赖）。

---

### Task 1: C2-b-1 dedup 跨零剪枝修复 + 时间窗分桶

**Files:**
- Modify: `src/utils/dedup.ts`
- Test: `src/utils/dedup.test.ts`

**背景**：模糊阶段（dedup.ts:119-153）amount 升序 + `break` 剪枝。**设计核查（数值验证）**：j>i 不变式保证 b≥a，|b-a| 线性单调，原剪枝本就正确——计划初稿「跨零漏对 bug」为**误报**（模拟 [-2,8,10] 验证 sim 单调）。本任务定位修正为：**时间窗分桶优化（O(n²)→桶内，真实性能收益）+ 防御性同号守卫**（跨零不 break，行为等价，防未来排序/公式变化引入回归，并以测试锁定跨零正确性不变式）。

- [x] **Step 1: 重构模糊阶段**（已实现）
  1. `bucketKey(t, window)`：SAME_DAY→date / SAME_MONTH→slice(0,7) / SAME_WEEK→复用 getWeekNumber / SAME_QUARTER→年-q / SAME_YEAR→slice(0,4) / null→''（单桶全比较）；键与 isInSameTimeWindow 语义一致，桶内保留兜底校验
  2. 按桶 Map（首次出现序）分组，每桶内 amount 升序 + 双重循环
  3. **防御性同号守卫**：break 仅在同号（a.amount * b.amount > 0）时触发——跨零/含 0 保守继续比较（行为等价，防未来排序/公式变化引入回归）
  4. 精确对跳过与 isInSameTimeWindow 兜底保留
- [x] **Step 2: 测试** `dedup.test.ts` +3：
  - 跨零正确性锁定：txs = [10, -2, 8]（同月同 note），matchFields ['amount','date']（n=2）→ 断言 (8,10) 对发出（跨零不变式文档化，新旧实现均通过）
  - 分桶语义：SAME_MONTH 下「3 月 2 笔 + 4 月 1 笔 → 只发 3 月对」
  - null 窗口：全比较（跨月对也发）
- [x] **Step 3: 验证 + 提交** `npm test` + lint → commit `refactor: C2-b dedup 时间窗分桶优化 + 防御性同号剪枝守卫`，勾选本 Task + ROADMAP C2

---

### Task 2: C2-b-2 明细页筛选态分页 + 搜索防抖

**Files:**
- Create: `src/utils/transactionFilter.ts` + `src/utils/transactionFilter.test.ts`
- Modify: `src/pages/HistoryPage.tsx`

**背景**：HistoryPage.tsx:54-75 筛选态全量 toArray + 内存 filter **不 limit**；L93-104 IntersectionObserver 仅无筛选态启用；每键全量重扫。

- [ ] **Step 1: `src/utils/transactionFilter.ts`**：
  ```ts
  export interface FilterOptions {
    search?: string
    category?: string
    getCategoryName: (id: string) => string
  }
  export function filterTransactions(txs: Transaction[], opts: FilterOptions): Transaction[]
  // note 子串 / 分类名 / 金额字符串匹配（大小写归一）；search 空 + category 空 → 全量
  ```
- [ ] **Step 2: `HistoryPage.tsx`**：
  - 筛选态：`filterTransactions(all, { search, category: filterCategory, getCategoryName: (id) => getInfo(id).name }).slice(0, visibleCount)`
  - IntersectionObserver：isFiltering 分支同样启用（终止约定 `transactions.length >= visibleCount` 复用）
  - 搜索防抖：`searchInput` state（输入框即时渲染）→ 300ms debounce（useRef 定时器）→ `setSearch` + `setVisibleCount(PAGE_SIZE)`
- [ ] **Step 3: 测试** `transactionFilter.test.ts` +5（note 子串 / 分类名 / 金额 / 分类过滤 / 空搜索全量）
- [ ] **Step 4: 验证 + 提交** → commit `feat: C2-b 明细页筛选态分页 + 搜索防抖（纯函数过滤）`，勾选本 Task

---

### Task 3: C5 加密审计

**Files:**
- Create: `docs/specs/2026-08-12-crypto-threat-model.md`
- Modify: `src/llm/crypto.ts`、`src/hooks/useLLMSettings.ts`
- Test: `src/llm/crypto.test.ts`

**背景**：crypto.ts `decryptApiKey` catch-all 返回 `''`（L77-85）；useLLMSettings.ts:29 无 try/catch——密文损坏时 API Key 静默清空且 UI 无从感知。测试锁定：legacy Base64 兼容（L34-39）、空串直返（L29-32）、encrypt 失败抛错（L41-45）。

- [ ] **Step 1: 文档** `docs/specs/2026-08-12-crypto-threat-model.md`：威胁模型（硬编码 passphrase + 设备盐 localStorage 的防护边界——防明文泄露 ✓ / 防本机读取 ✗ / 防导库重放部分保护）+ D5 用户密码派生迁移路线（双密钥渐进重加密）
- [ ] **Step 2: crypto.ts**：`decryptApiKey` 非 legacy 解密失败**抛错**（legacy atob 失败同样抛错）；空串直返保持；legacy 兼容分支保持
- [ ] **Step 3: useLLMSettings.ts**：loadConfig 的 decrypt 包 try/catch → 失败时 `apiKey: ''` + `log.warn`（不卡 loading、可观测）
- [ ] **Step 4: 测试** crypto.test.ts +2（损坏密文抛错 / 非 base64 抛错）；既有 6 用例全保持
- [ ] **Step 5: 验证 + 提交** → commit `feat: C5 加密审计（威胁模型文档 + decrypt 失败显式化）`，勾选本 Task + ROADMAP C5

---

### Task 4: 收尾

- [ ] **Step 1: PROGRESS.md** 记 2026-08-12 C 层第二批
- [ ] **Step 2: 全量验证** `npm run lint` + `npm test`（247 → ~258）+ `npm run build` + `npm run test:e2e`
- [ ] **Step 3: PR** → CI quality + e2e 双绿 → squash 合并 → 删分支 → 验证 main 同步

---

## Self-Review

**1. ROADMAP 覆盖核对：** C2（Task 1+2）/ C5（Task 3）全覆盖；C1 / C7 记档后续批。
**2. 行为保持：** dedup 精确对仍 pairs[0]、模糊对无顺序断言（find）；null 时间窗不分桶等价现状；decrypt 正常路径（合法密文/legacy/空串）不变；E2E 零改动。
**3. 已知风险：** 分桶键与 isInSameTimeWindow 语义需一致（保留兜底校验防御偏差）；SAME_WEEK 桶键与 getWeekNumber 实现需对齐（测试覆盖）；筛选态分页后 `transactions.length >= visibleCount` 终止约定在「总数恰为 visibleCount 倍数」时多触发一次空加载（无害）。
