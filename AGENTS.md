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

提交前必须保证 `npm run lint` + `npm test` + `npm run build` 通过（CI `quality` 检查同款：node 20 + npm ci + lint + test + build）。

## Git 工作流

- `main` 为稳定入口，**受保护，禁止直接 push**。
- 所有代码变更走「分支 + PR」：`git checkout -b <scope/描述>` → 开发 → 提交 → `gh pr create --base main --head <分支>` → 等 CI `quality` 通过 → squash 合并。
- 合并后删除本地与远端分支，保持远端干净。
- 版本 SemVer，同步更新 `CHANGELOG.md` 与 GitHub Release；未来方向见 `docs/ROADMAP.md`。
- 文档类变更（README/docs）也走 PR，与代码同规则。

## 测试约定

- 单测：`src/**/*.test.ts`，vitest + fake-indexeddb；DB 契约、解析器、去重、备份均有覆盖（~169 用例）。
- E2E：`e2e/specs/*.spec.ts`，Playwright + mock LLM 拦截，不消耗真实 API。
- 新增功能必须带测试（DB 层契约单测 + 关键路径 E2E）。

## 目录要点

- `src/db/` Dexie schema v11，升级自动迁移
- `src/nlp/` 本地解析管线（amountExtractor / dateParser / noteCleaner / categoryMatcher）
- `src/bill-analyzer/` 模板自适应解析
- `src/llm/` LLM 客户端（API Key AES-GCM 本地加密，请求脱敏）
- `docs/specs/` 设计文档与实现计划
