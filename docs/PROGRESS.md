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

### P0 进度总览

| 项 | 状态 |
|---|---|
| P0-1 Lint 清零 | ✅ |
| P0-2 导出修复(CSV BOM/转义 + JSON schemaVersion) | ⏳ 进行中 |
| P0-3 删 legacyParse + 统一 CSV 解析 | ⬜ |
| P0-4 硬去重快速路径 | ⬜ |
| P0-5 PWA 补图标 | ⬜ |
| P0-6 静默错误可观测 | ⬜ |
