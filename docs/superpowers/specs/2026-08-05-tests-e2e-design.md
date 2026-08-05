# P1-7 测试补齐 + E2E 设计文档

> 日期:2026-08-05 · 分支:`p1-7-tests-e2e`
> 目标:ROADMAP P1-7 —— DB CRUD / 备份恢复 / 导入 / 模板匹配 / NLP 单测补齐 + Playwright E2E 覆盖核心流

## 背景

- 现状:13 个 Vitest 测试文件 ~117 用例,无 E2E
- 未覆盖模块:`backup.ts`、`import.ts`(parseBillFile)、`templateMatcher.ts`、`learningFlow.ts`、`analyzer.ts`、DB CRUD(`bulkImportTransactions`)、NLP 子模块(amountExtractor/dateParser/noteCleaner)
- ROADMAP P1-7:测试补齐(DB CRUD / 备份恢复 / 导入导出 / NLP / 模板匹配)+ Playwright E2E 覆盖核心流(记账 -> 导入 -> AI 工作台 -> 去重)

## 决策

1. **方案**:Playwright 独立 E2E 目录 + `page.route()` 拦截 LLM 请求返回 fixture——零生产代码改动
2. **LLM 策略**:E2E 全部 mock LLM(mock-llm helper 按意图分发 fixture),聊天记账走真实 llmChat 管道而非本地 NLP 回退
3. **CI**:E2E 仅本地跑(`npm run test:e2e`),不纳入 GitHub Actions(用户确认)

## 一、E2E 基础设施

```
e2e/
├── playwright.config.ts        # webServer 起 vite preview,baseURL
├── fixtures/
│   ├── llm-responses.ts        # record/query/modify/audit/batch 各意图 mock JSON
│   └── bills/
│       ├── alipay.csv          # 支付宝 CSV fixture(含 BOM 场景可选)
│       └── wechat.xlsx         # 微信 Excel fixture(从 public 样例复制或脚本生成)
├── helpers/
│   └── mock-llm.ts             # page.route('**/chat/completions') 按消息内容分发 fixture + 调用日志
└── specs/
    ├── home-chat.spec.ts       # 聊天记账流(record/query/modify/delete)
    ├── import.spec.ts          # 导入流(setInputFiles -> 解析 -> 映射 -> 导入)
    ├── ai-workspace.spec.ts    # AI 工作台流(配置 LLM -> 审计 -> suggestions -> 应用)
    └── dedup.spec.ts           # 去重流(导入含重复数据 -> 检测 -> 合并)
```

- `npm run test:e2e` 脚本:`vite build` 后 `playwright test`(webServer 自动起 `vite preview`)
- mock-llm 数据流:`page.route` 拦截请求 -> 解析请求体 user 消息 -> 按关键词(记账/查询/审计/分类)返回 fixture JSON -> 应用零感知
- 新增 devDep:`@playwright/test`;CI 配置不动
- 每个 spec `beforeEach` 清空 IndexedDB,保证 fresh 状态

## 二、单测补齐(新增 5 个测试文件)

| 测试文件 | 覆盖 | 预估用例 |
|---|---|---|
| `src/utils/backup.test.ts` | createBackup(auto/manual)、listBackups、restoreBackup 事务回滚(目标缺失抛错)、deleteBackup | ~8 |
| `src/utils/import.test.ts` | parseBillFile 三来源解析、格式无法识别抛错、自定义列映射、BOM/多行引号 | ~8 |
| `src/db/crud.test.ts` | bulkImportTransactions 批量写入、transactions CRUD、categories 增删改(内置禁删/占用检查)、budgets | ~8 |
| `src/bill-analyzer/templateMatcher.test.ts` | 内置模板匹配三来源、相似度阈值、无匹配回退、学习模板优先级 | ~7 |
| `src/nlp/parser.test.ts` | amountExtractor(数字/中文/小数/助词)、dateParser、noteCleaner 边界 | ~10 |

共约 40 个新用例(117 -> ~157),fake-indexeddb + 现有测试模式,不动生产代码。

## 三、E2E 核心流程

**home-chat.spec.ts**
1. 输入「打车15」-> mock 返回 record 卡片 -> 确认 -> 本月支出 +15
2. 查询「本月花了多少」-> mock 返回 query 回答 -> 气泡显示 ¥15
3. 修改/删除 -> 卡片 + 确认 -> 断言库内数据变化

**import.spec.ts**
1. setInputFiles 选 alipay.csv -> 解析出 N 行 -> 走列映射 -> 导入 -> 明细页出现交易

**ai-workspace.spec.ts**
1. 设置页配置 LLM(endpoint/key)-> 工作台发起审计 -> mock 返回 suggestions -> 卡片渲染 -> 应用后明细更新

**dedup.spec.ts**
1. 导入含重复两笔 -> 去重页 -> 显示重复对 -> 合并后只剩一笔

## 四、稳定性与验收

- mock-llm 记录调用日志,断言可检查「LLM 被调用 N 次」
- 断言用 auto-wait,避免固定 sleep
- spec 失败自动截图(`--reporter=html`)
- 验收:`npm run test`(~157 全绿)/ `npm run lint`(0)/ `npm run build` 通过 / `npm run test:e2e`(4 spec 全绿)
- 文档:ROADMAP P1-7 勾选 + PROGRESS.md 记本次迭代 + CHANGELOG
- 版本:1.2.0 -> 1.3.0;独立分支合并 main 后 tag

## 不做(边界)

- E2E 不进 CI(用户确认)
- 不做真实 LLM E2E(仅 mock)
- 不引入 Testing Library 组件测试(方案 2 已弃)
- 不改生产代码(包括 llm/client.ts)
