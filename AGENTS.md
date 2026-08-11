# AGENTS.md — moneynote

本地优先的个人记账 PWA（自然语言记账 / AI 工作台 / 账单导入 / 模糊去重）。

## 技术栈

React 19 · Vite 8 · TypeScript · Tailwind v4 · Dexie (IndexedDB) · recharts · framer-motion · vite-plugin-pwa · vitest · Playwright

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # tsc -b && vite build（typecheck + 构建）
npm run lint         # ESLint
npm test             # vitest 单测（使用 fake-indexeddb）
npm run test:e2e     # build + Playwright E2E（会 mock LLM）
npm run test:e2e:ui  # Playwright UI 模式
```

提交前必须保证 `npm run lint` + `npm test` + `npm run build` + `npm run test:e2e` 通过（CI `quality` + `e2e` 双 job：node 20 + npm ci + lint + test + build + Playwright chromium，mock LLM 无 secret）。

## Git 工作流

- `main` 为稳定入口，**受保护，禁止直接 push**。
- 所有代码变更走「分支 + PR」：`git checkout -b <scope/描述>` → 开发 → 提交 → `gh pr create --base main --head <分支>` → 等 CI `quality` 通过 → squash 合并。
- 合并后删除本地与远端分支，保持远端干净。
- 版本 SemVer，同步更新 `CHANGELOG.md` 与 GitHub Release；未来方向见 `docs/ROADMAP.md`。
- 文档类变更（README/docs）也走 PR，与代码同规则。

## 测试约定

- 单测：`src/**/*.test.ts`，vitest + fake-indexeddb；DB 契约、解析器、去重、备份均有覆盖（~169 用例）。
- E2E：`e2e/specs/*.spec.ts`，Playwright + mock LLM 拦截，不消耗真实 API；CI `e2e` job 自动运行，失败上传 `playwright-report/`。
- 新增功能必须带测试（DB 层契约单测 + 关键路径 E2E）。

## 目录要点

- `src/db/` Dexie schema v12，升级自动迁移
- `src/nlp/` 本地解析管线（amountExtractor / dateParser / noteCleaner / categoryMatcher）
- `src/bill-analyzer/` 模板自适应解析
- `src/llm/` LLM 客户端（API Key AES-GCM 本地加密，请求脱敏）
- `docs/specs/` 设计文档与实现计划

## Hard rules（真实失败教训）

1. **Never leave a failing test in the working tree.** A failing test = task not done. Fix or revert before moving on.
2. **Update plan checkboxes as you go.** Tick `- [ ]` boxes in `docs/superpowers/plans/*.md` in the same commit you complete the step.
3. **Commit only intended files.** Check `git status` before every commit; never commit secrets or local DB dumps.
4. **Push discipline:** after a merge, verify `git status` shows no unpushed commits (main has silently drifted before).
5. **Timezones:** date parsing/formatting goes through dayjs; tests must not assume a fixed TZ offset.

## In-flight work（as of 2026-08-07）

- 双本地副本已整合：本仓库为 GitHub 同步源，统一走 `05-项目代码/记账类/MoneyNote/` 主副本工作。
- P1-7（测试 + E2E）计划文档：`docs/superpowers/plans/2026-08-05-tests-e2e.md`，状态以 ROADMAP 勾选为准。
- AGENTS.md 由双副本内容合并而成（工作流规则 + 中文规范）。
