# MoneyNote · AI 智能记账

本地优先的个人记账 Web 应用（PWA）。自然语言输入 + 账单导入 + AI 工作台，数据全部存在浏览器 IndexedDB，API Key 本地加密，AI 请求脱敏。

> 2026-07-14：作为记账类项目整合后的唯一主力。原 finance-app(Expo 移动端)、项控(Tauri 桌面端) 的 AI 工作台 / 脱敏 / 模糊去重功能已移植进来，两个项目已归档至 `~/Documents/07-归档项目/记账类-归档/`。整合说明见上级目录 `../README.md`。

## 功能

- **记账**：自然语言一句话记账（LLM 解析金额/分类/日期/备注）；导入支付宝 CSV、微信/平安 Excel 账单，含模板自适应学习与硬去重
- **AI 工作台**（`/ai-workspace`）：综合审计、自动归类、智能查重、月度摘要四类任务，AI 建议逐条审核后应用；结果按流水签名缓存（重跑不重复消耗 API）、超量分批+进度、可强制刷新；月度摘要支持任意月份
- **模糊去重审核**（明细页入口）：基于相似度 + 时间窗的可配置查重（amount 排序剪枝，大数据量也快），保留 A / 保留 B / 忽略
- **统计 / 预算 / 明细**：分类饼图、趋势折线、预算追踪、全量明细搜索筛选
- **数据安全**：`storage.persist()` 防驱逐 + 自动防抖快照（保留 10 份）+ 手动备份/恢复；删除/去重合并/应用分类均支持 5 秒撤销
- **隐私**：API Key AES-GCM 加密存本地；AI 请求脱敏手机号/订单号/身份证/邮箱/带称呼姓名
- **PWA**：可离线安装；路由级懒加载，首屏 ~150kB gzip

## 技术栈

React 19 · Vite · TypeScript · Tailwind v4 · Dexie(IndexedDB) · recharts · framer-motion · vite-plugin-pwa · vitest

## 运行

```bash
npm install
npm run dev      # 开发服务器
npm run build    # tsc -b && vite build
npm run lint
npm test         # vitest 单测（redact/auditPrompt/dedup 纯逻辑）
```

AI 配置在「设置」页：选服务商预设（DeepSeek / OpenAI / 通义千问 / 自定义），填 API Key 与模型。未配置时 AI 工作台自动回退到本地启发式规则。

## 数据层

Dexie schema 演进至 v9：

| 版本 | 内容 |
|---|---|
| v1–v5 | transactions / categories / budgets / settings / classificationCache / parseCache / billTemplates |
| v6 | `aiSuggestions`（AI 工作台建议） |
| v7 | `dedupStrategies` / `dedupRecords`（模糊去重） |
| v8 | `backups`（自动/手动数据备份） |
| v9 | `auditCache`（AI 审计结果缓存） |

升级自动迁移。
