# MoneyNote · AI 智能记账

[![CI](https://github.com/Justin-Ju-0413/moneynote/actions/workflows/ci.yml/badge.svg)](https://github.com/Justin-Ju-0413/moneynote/actions/workflows/ci.yml)

本地优先的个人记账 Web 应用（PWA）。自然语言输入 + 账单导入 + AI 工作台，数据全部存在浏览器 IndexedDB，API Key 本地加密，AI 请求脱敏。

## 功能

- **记账**：ChatGPT 式对话记账，支持记一笔 / 查询 / 修改 / 删除 / 闲聊 5 种意图，数据变更前弹出确认卡片；自然语言解析走「本地规则 5 阶段管线 + LLM 增强」混合策略；导入支付宝 CSV、微信/平安 Excel 账单，含模板自适应学习与硬去重
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
npm ci
npm run dev      # 开发服务器
npm run build    # tsc -b && vite build
npm run lint
npm test         # vitest 单测（redact/auditPrompt/dedup 纯逻辑）
```

AI 配置在「设置」页：选服务商预设（DeepSeek / OpenAI / 通义千问 / 自定义），填 API Key 与模型。未配置时 AI 工作台自动回退到本地启发式规则。

### 无 API Key 演示

应用不要求登录或 API Key。启动后可以直接新增记录，或在设置页导入 [`public/sample-data.csv`](public/sample-data.csv) 体验统计、预算、导出和本地规则；只有显式启用在线 AI 服务时才会发送已脱敏的请求。

账单导入支持 `.csv` 和 `.xlsx`。二进制 `.xls` 不再支持，请先另存为 `.xlsx`；单个 Excel 文件限制为 20 MB。

## 数据层

Dexie schema 演进至 v11：

| 版本 | 内容 |
|---|---|
| v1–v5 | transactions / categories / budgets / settings / classificationCache / parseCache / billTemplates |
| v6 | `aiSuggestions`（AI 工作台建议） |
| v7 | `dedupStrategies` / `dedupRecords`（模糊去重） |
| v8 | `backups`（自动/手动数据备份） |
| v9 | `auditCache`（AI 审计结果缓存） |
| v10 | `billTemplates` 增加 `importCount` 索引（修复设置页 orderBy 白屏） |
| v11 | `chatMessages`（首页 ChatGPT 式对话历史持久化） |

升级自动迁移。

## 恢复、迁移与隐私

- **恢复**：设置页可创建和恢复 IndexedDB 快照；自动快照最多保留 10 份。关键操作另有 5 秒撤销，但它不能替代离线备份。
- **迁移**：JSON 导出包含 `schemaVersion`。升级前建议先导出 JSON；未来 schema 变更必须提供向前迁移和旧导出兼容测试。
- **隐私**：交易和设置默认只保存在当前浏览器。清理站点数据、浏览器配置损坏或设备丢失都可能同时删除数据与同库快照，因此重要账本应定期导出到仓库之外。
- **AI 边界**：API Key 使用浏览器端 AES-GCM 封装保存，交易文本在请求前做字段脱敏；浏览器端加密不能防御已控制设备或同源恶意脚本。不开启 AI 时不会发出 AI 请求。

## Release 与开发约定

稳定入口始终为 `main`。功能在分支上开发并通过 PR 合并；版本使用 SemVer，并在 GitHub Release 与 [`CHANGELOG.md`](CHANGELOG.md) 同步记录。未来方向见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## License

MIT
