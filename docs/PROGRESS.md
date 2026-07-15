# MoneyNote 进度日志

> P0 执行记录,最新在前。每项落地后勾选 `docs/ROADMAP.md` 对应条目。

---

## 2026-07-15

### P0-1 Lint 清零 ✅

- **结果**:lint 18 问题(16 错 2 警)-> **0**;单测 27/27 过;`tsc -b && vite build` 通过
- **commit**:`b4a1f31`(分支 `p0-cleanup`)
- **改了什么**:
  - 拆分 `Toast.tsx` -> 新建 `toast-context.ts`(`useToast`/context/类型 与 `ToastProvider` 组件分文件,消除 `react-refresh/only-export-components`)
  - 抽出 `roleLabels.ts`(`getRoleLabel`/`ROLE_OPTIONS` 与 `ColumnMappingDialog` 分文件;`TemplateDetailDialog` 改引用路径)
  - `ColumnMappingDialog`:`useMemo` 内 `setState` + 早返回在 hook 之前(违反 rules-of-hooks)-> render 期 prev-tracking + 所有 hook 前置
  - `EditDialog` / `SettingsPage`(config 初始化):effect 内 `setState` -> render 期 prev-tracking(React 「adjust state during render」模式)
  - `useBillTemplateLearning`:render 期读 `fileRef.current` -> 改 `useState`(`ref` 退出该 hook)
  - `SettingsPage`:`handleImportClick`(读 `fileInputRef.current`)从 render 期 `settingItems` 数组移出,直接挂 `onClick`(满足 React Compiler `react-hooks/refs`)
  - `AIWorkspacePage` / `HistoryPage`:`useLiveQuery(...) ?? []` -> 稳定 `EMPTY_TRANSACTIONS`(消除 exhaustive-deps)
  - `analyzer.ts` / `import.ts`:`let text = ''` -> `let text: string`(no-useless-assignment)
  - `eslint.config.js`:加 `argsIgnorePattern: '^_'` 等(保留 `universalParser` 的 `_dateFormat` 占位,留给 P2 日期解析增强)

### P0-2 导出修复 ✅

- **结果**:CSV 加 BOM+RFC4180 引号转义;JSON 加 schemaVersion;单测 +8(35->35 含其他)
- **commit**:`3889816`
- **改了什么**:
  - `export.ts`:新增 `csvField` 按 RFC 4180 转义(字段含逗号/引号/换行->双引号包裹+内部引号双写),替代原「全角逗号替换」hack;加 UTF-8 BOM、CRLF 换行
  - `exportToJSON` 包一层 `{ schemaVersion:1, app, exportedAt, transactions }`,为 P1 迁移框架铺路
  - 新增 `export.test.ts` 8 条(BOM/CRLF/转义/schemaVersion)
  - 注:导出 JSON 暂无恢复消费方,改结构安全;未来恢复需兼容裸数组旧格式

### P0-4 硬去重快速路径 ✅

- **结果**:`detectDuplicates` 加 O(n) 硬去重预筛;单测 +3(38);lint 0
- **commit**:`9a6367a`
- **改了什么**:
  - `dedup.ts` 改两阶段:① 按 `amount|date|note` 哈希分组,O(n) 发出精确重复对(similarity=1);② 模糊 O(n²) 阶段跳过已发出的精确对
  - 行为不变(三字段全等的对原本也算出 1.0),仅提速;大库多重复时收益明显
  - 补 3 个测试:三笔全同发 3 对 / 不重复发出 / 精确+模糊并存

### P0-5 PWA 补图标 ✅

- **结果**:manifest 引用的 192/512/apple-touch-icon PNG 补齐;构建 precache 22->25
- **commit**:`dba4a4b`
- **改了什么**:
  - 新增 `scripts/generate-icons.mjs`:用 sharp 从 `favicon.svg` 光栅化为 192/512/180 三尺寸 PNG(可复现再生)
  - sharp 加为 devDep
  - **附带发现**:`npm audit` 报 `xlsx@0.18.5` 高危(原型污染 + ReDoS),为既有依赖债、npm 上无修复版本(SheetJS 已迁自家 CDN),留待单独处理(可换 `@e965/xlsx` 或 CDN 版)

### P0-6 静默错误可观测 ✅

- **结果**:5 处关键路径静默 catch 改为结构化 `warn`;lint 0
- **commit**:`77a201e`
- **改了什么**:
  - 新增 `src/utils/log.ts`:统一 `[MoneyNote]` 前缀的 `warn`/`error`,为未来遥测留接入点
  - 5 处 `catch { noop }` 改 `log.warn`:billClassifier 缓存读/写、universalParser 过滤规则/清洗前缀正则无效、templateMatcher 统计更新
  - 保留静默:4 处 JSON.parse 三层 fallback(正常控制流)、db/index.ts 内置模板回填(init 守卫,有注释)

### P0-3 删 legacyParse + 统一 CSV 解析 ✅

- **结果**:移除 300+ 行 `@deprecated` legacyParse;3 份 parseCSVLine 合并;precache 1383.81->1379.26 KiB;lint 0 / 单测 38 / 构建通过
- **commit**:`e3dc1f3`
- **改了什么**:
  - 新增 `src/utils/csv.ts`,analyzer/universalParser 改 import 并删本地副本,import.ts 删 legacyParse 后不再需要
  - `parseBillFile` 5c 由「静默走旧解析器兜底」改为明确抛错:无法识别格式时要求完成列映射学习
  - 移除 legacyParse / legacyDetectExcelSource / legacyParseAlipayCSV / legacyParseWeChatExcel / legacyParsePingAnExcel
  - `ParseResult.matchType` 去掉 `'legacy'`(内置模板已在 5a 覆盖三来源标准格式)
  - **行为变化**:仅「非标准格式 + 用户取消学习」窄场景,原先隐藏兜底导入 -> 现明确报错(更可预期)

### P0 进度总览

| 项 | 状态 |
|---|---|
| P0-1 Lint 清零 | ✅ |
| P0-2 导出修复(CSV BOM/转义 + JSON schemaVersion) | ✅ |
| P0-3 删 legacyParse + 统一 CSV 解析 | ✅ |
| P0-4 硬去重快速路径 | ✅ |
| P0-5 PWA 补图标 | ✅ |
| P0-6 静默错误可观测 | ✅ |

**P0 全部完成 🎉** — lint 0 / 单测 38(原 27)/ 构建通过。基线已拉回全绿。`p0-cleanup` 分支可合并到 main 后进入 P1 架构升级。

---

## P1 架构升级(进行中)

### P1-1 LLMClient 统一抽象 ✅

- **结果**:4 份重复 fetch 收敛为 `llmChat`;LLM 层可测(+13 单测);lint 0 / 单测 51 / 构建通过
- **commit**:`2842d56`(分支 `p1-architecture`)
- **改了什么**:
  - 新增 `src/llm/client.ts`:`llmChat` 统一 fetch + 错误映射(offline/config/timeout/network/http),OpenAI 兼容为基,Provider 适配器可在此扩展;`__setLLMTransport` 可注入 transport 作 mock 边界
  - `service.ts` 的 callLLM/callLLMBatch/runLLMAudit + `aiMapper.ts` 的 callLLMForMapping 全部改用 llmChat,删除 4 份重复 URL/Bearer/状态码/超时
  - 行为保持:签名/返回形状不变;offline 判断改 `=== false`(浏览器不变,兼容测试环境);runLLMAudit 空 content 仍当 `'{}'` 解析
  - HTTP 错误文案统一短句('API Key 无效' 等,原 callLLM 长句并入)
  - 新增 `client.test.ts` 13 条

### P1 进度总览

| 项 | 状态 |
|---|---|
| P1-1 LLMClient 统一抽象 | ✅ |
| P1-2 Task 注册抽象 | ⬜ |
| P1-3 Prompt 版本化 | ⬜ |
| P1-4 bill-analyzer 并入 llm 层 | ⬜ |
| P1-5 Repository / 状态层 | ⬜ |
| P1-6 Dexie 迁移框架 | ⬜ |
| P1-7 测试补齐(单测 + E2E) | ⬜ |
| P1-8 结构化输出 | ⬜ |
| P1-9 加密审计 | ⬜ |
