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

### P0 进度总览

| 项 | 状态 |
|---|---|
| P0-1 Lint 清零 | ✅ |
| P0-2 导出修复(CSV BOM/转义 + JSON schemaVersion) | ✅ |
| P0-3 删 legacyParse + 统一 CSV 解析 | ⬜ |
| P0-4 硬去重快速路径 | ✅ |
| P0-5 PWA 补图标 | ⬜ |
| P0-6 静默错误可观测 | ⬜ |
