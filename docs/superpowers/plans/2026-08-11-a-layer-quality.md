# A 层 · 巩固质量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐回归防线与残留结构债（ROADMAP v2 A 层 4 任务）：E2E 进 CI、aiMapper 并入 llm 层（P1-4）、Prompt 版本化（P1-3）、发布自动化。

**Architecture:**
- A2/P1-4：`mappingTask` 描述符（`src/llm/mapping.ts`）+ prompt 搬家 `src/llm/mappingPrompt.ts`，删 `bill-analyzer/aiMapper.ts` + `aiPrompt.ts`，对外 API（`bill-analyzer/index.ts` re-export）零变化
- A3/P1-3：`src/llm/promptVersion.ts` 提供 `PROMPT_VERSIONS` + `promptVersionKey`；接入两个在用缓存（classificationCache / auditCache）；孤儿模块 parseCache 不动
- A1：CI 新增 `e2e` job（build + playwright install chromium + test + 失败产物上传）；`reuseExistingServer: !process.env.CI`；删游离副本 `e2e/specs/learning.spec 2.ts`
- A4：`scripts/release.mjs`（版本 bump → 双处同步 → CHANGELOG 校验 → tag → gh release），零新依赖；修复破损 ref `refs/tags/v1.3.0 2`

**Tech Stack:** TypeScript / GitHub Actions / Node (ESM scripts)

## Global Constraints

- 不引入新依赖；不改 E2E 测试内容；parseCacheService 孤儿模块不动
- 提交前 `npm run lint` + `npm test` + `npm run build` 通过；关键路径跑 `npm run test:e2e`
- 每任务一个 commit，同 commit 勾选本计划 + ROADMAP 对应条目

---

### Task 1: A2 P1-4 aiMapper 并入 llm 层

**Files:**
- Create: `src/llm/mappingPrompt.ts`（搬家自 `src/bill-analyzer/aiPrompt.ts`）
- Create: `src/llm/mapping.ts`
- Delete: `src/bill-analyzer/aiMapper.ts`, `src/bill-analyzer/aiPrompt.ts`
- Modify: `src/bill-analyzer/index.ts`（re-export 指向 llm 层）、`src/bill-analyzer/learningFlow.ts`（import 改向）
- Test: `src/llm/mapping.test.ts`

**Interfaces:**
- Consumes: `runTask`/`TaskDescriptor`（`src/llm/task.ts`）、`buildMappingMessages`/`parseMappingResponse`（搬家后）
- Produces: `mappingTask` 描述符 + `aiAssistColumnMapping(config, headers, sampleRows, heuristicRoles)` 薄封装（签名不变）

- [x] **Step 1: grep 确认引用方**（已完成：仅 learningFlow.ts + index.ts，无测试/e2e 引用）

- [x] **Step 2: 写失败测试** `src/llm/mapping.test.ts`（`__setLLMTransport` mock，风格对齐 task.test.ts）：

```ts
// 成功：AI 补充空白列，启发式角色不被覆盖
// errorKind → fallback 返回 heuristicRoles
// 空 content → fallback 返回 heuristicRoles
// 非法 role → 'skip'
// confidence < 0.6 不采纳
// date/amount 角色去重（AI 报第二个 date 时被忽略）
// 启发式已知角色即使 AI 给不同值也不被覆盖
// chatOptions 透传（maxTokens 512 / timeout 15000 在请求体）
```

- [x] **Step 3: 实现**
  1. `src/llm/mappingPrompt.ts`：`MAPPING_SYSTEM_PROMPT` + `buildMappingMessages` + `parseMappingResponse` + `export const MAPPING_PROMPT_VERSION = 1`（Task 2 用）
  2. `src/llm/mapping.ts`：
     ```ts
     const mappingTask: TaskDescriptor<MappingRequest, (ColumnRole | null)[]> = {
       name: 'mapping',
       buildMessages: (input) => buildMappingMessages(input.headers, input.sampleRows, input.knownRoles),
       chatOptions: { maxTokens: 512, timeout: 15000 },
       // parse：原 aiAssistColumnMapping 的合并逻辑（启发式优先、AI 补空白、≥0.6 采纳、date/amount 去重）
       parse: (content, input) => mergeMappingRoles(input, parseMappingResponse(content, input.headers.length)),
       fallback: (input) => input.knownRoles, // 原错误时返回启发式
     }
     export async function aiAssistColumnMapping(config, headers, sampleRows, heuristicRoles) {
       const { result } = await runTask(mappingTask, { headers, sampleRows, knownRoles: heuristicRoles }, { config, privacyMode: false })
       return result ?? heuristicRoles
     }
     ```
  3. 删旧文件，`index.ts` re-export 改 `@/llm/mapping` / `@/llm/mappingPrompt`，`learningFlow.ts` import 改 `@/llm/mapping`

- [x] **Step 4: 运行确认通过** `npm test`（新增 mapping.test.ts 全过 + 既有全绿）+ `npm run lint` + `npm run build`

- [x] **Step 5: 提交** 勾选本 Task + ROADMAP A2
  ```bash
  git add src/llm/mapping.ts src/llm/mappingPrompt.ts src/llm/mapping.test.ts src/bill-analyzer/
  git commit -m "feat: P1-4 aiMapper 并入 llm 层（mappingTask 描述符）"
  ```

---

### Task 2: A3 P1-3 Prompt 版本化

**Files:**
- Create: `src/llm/promptVersion.ts` + `src/llm/promptVersion.test.ts`
- Modify: `src/utils/billClassifier.ts`（lookupCache/writeCache 键带版本）、`src/hooks/useAIWorkspace.ts`（audit cacheKey 带版本）
- Test: `src/utils/billClassifier.test.ts`（版本失效语义）

- [ ] **Step 1: 写失败测试**
  - `promptVersion.test.ts`：`promptVersionKey('星巴克', 'batch') === '星巴克::v1'`；版本 bump 后键变化（改对象值模拟）
  - `billClassifier.test.ts` 追加：写缓存后同版本命中；版本变更后未命中（构造不同版本 key 验证失效）

- [ ] **Step 2: 实现**
  1. `src/llm/promptVersion.ts`：
     ```ts
     // 各任务 system prompt 版本：改 prompt 时 bump 对应值 → 旧缓存自动失效（P1-3）
     export const PROMPT_VERSIONS = { parse: 1, batch: 1, audit: 1, chat: 1, mapping: 1 } as const
     export function promptVersionKey(key: string, task: keyof typeof PROMPT_VERSIONS): string {
       return `${key}::v${PROMPT_VERSIONS[task]}`
     }
     ```
  2. `billClassifier.ts`：`lookupCache`/`writeCache` 用 `promptVersionKey(merchant, 'batch')`
  3. `useAIWorkspace.ts:71`：`hashKey(promptVersionKey(`${task}|${sig}`, 'audit'))`

- [ ] **Step 3: 运行确认通过** `npm test` + `npm run lint`

- [ ] **Step 4: 提交** 勾选本 Task + ROADMAP A3
  ```bash
  git add src/llm/promptVersion.ts src/llm/promptVersion.test.ts src/utils/billClassifier.ts src/hooks/useAIWorkspace.ts
  git commit -m "feat: P1-3 prompt 版本化（classificationCache/auditCache 键入版本）"
  ```

---

### Task 3: A1 E2E 进 CI

**Files:**
- Modify: `.github/workflows/ci.yml`、`playwright.config.ts`、`AGENTS.md`
- Delete: `e2e/specs/learning.spec 2.ts`（游离重复副本）

- [ ] **Step 1: ci.yml 新增 e2e job**
  ```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build          # webServer 是 vite preview，依赖 dist/
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
          retention-days: 7
  ```
- [ ] **Step 2: playwright.config.ts** `reuseExistingServer: !process.env.CI`
- [ ] **Step 3: 删 `e2e/specs/learning.spec 2.ts`**；AGENTS.md「测试约定」更新（E2E 进 CI，原「不进 CI」删除）
- [ ] **Step 4: 本地验证** `npm run test:e2e`（6 spec 全绿）
- [ ] **Step 5: 提交** 勾选本 Task + ROADMAP A1
  ```bash
  git add .github/workflows/ci.yml playwright.config.ts AGENTS.md e2e/specs/
  git commit -m "ci: E2E 进 CI（playwright job + 失败产物上传）"
  ```

---

### Task 4: A4 发布自动化

**Files:**
- Create: `scripts/release.mjs`
- Modify: `AGENTS.md`（工作流补发布命令）
- 修复破损 ref：`git update-ref -d "refs/tags/v1.3.0 2"`

- [ ] **Step 1: 修复破损 tag ref**（全零 id 的 `refs/tags/v1.3.0 2`，`git show-ref --tags` 会 fatal）
- [ ] **Step 2: 实现 `scripts/release.mjs`**（风格对齐 generate-icons.mjs：ESM、顶部中文注释、✓ 输出、零新依赖）：
  - `node scripts/release.mjs [patch|minor|major|<1.4.0>] [--dry-run]`
  - 流程：校验 git 干净 + 在 main → 计算新版本（SemVer）→ 同步 package.json version + constants.ts APP_VERSION → 校验 CHANGELOG 含 `## [v] - YYYY-MM-DD` 段（缺失则报错）→ 自动 commit（chore: version bump 1.x.y→1.x.z）→ `git tag -a vX.Y.Z` + push → 从 CHANGELOG 段提取 notes 调 `gh release create`（title 统一 = tag 名）
  - `--dry-run` 只打印将执行步骤，不做任何变更
- [ ] **Step 3: AGENTS.md 工作流** 补「发布：`node scripts/release.mjs <patch|minor|major>`（或手动）」
- [ ] **Step 4: 验证** `node --check scripts/release.mjs` + `node scripts/release.mjs patch --dry-run`
- [ ] **Step 5: 提交** 勾选本 Task + ROADMAP A4
  ```bash
  git add scripts/release.mjs AGENTS.md
  git commit -m "feat: 发布自动化脚本（release.mjs：bump→CHANGELOG 校验→tag→release）"
  ```

---

### Task 5: 收尾

- [ ] **Step 1: PROGRESS.md** 记 2026-08-11 A 层迭代
- [ ] **Step 2: 全量验证** `npm run lint` + `npm test`（196 → ~215）+ `npm run build` + `npm run test:e2e`
- [ ] **Step 3: PR** → CI quality + e2e 双绿 → squash 合并 → 删分支 → 验证 main 同步

---

## Self-Review

**1. ROADMAP 覆盖核对：** A1（Task 3）/ A2（Task 1）/ A3（Task 2）/ A4（Task 4）全覆盖。
**2. 行为保持：** `aiAssistColumnMapping` 签名与返回不变（merge 逻辑原样搬入 parse）；缓存键格式变化是有意为之（版本失效语义）；E2E 测试内容零改动。
**3. 已知风险：** A2 的 parse 搬入合并逻辑后，`runTask` 的 validate 缺省（parse 非 null 即过）——与原行为一致（原代码仅按 error/空判断）；CI e2e job 首次运行需装浏览器，耗时约 1-2 分钟。
