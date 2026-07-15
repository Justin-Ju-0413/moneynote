# MoneyNote 长期进化计划

> 状态:草案 · 起草于 2026-07-15
> 依据:AI 层 / 数据骨架 / 账单解析与 NLP 三子系统审计 + 代码体检(lint/单测/构建)

## 定位与进化主轴

MoneyNote 是**本地优先、隐私不妥协的 AI 记账 PWA**。三条进化主轴:

1. **AI 层重构** —— 从「四份硬编码 HTTP 管道」到「统一可扩展的 LLM 平台」
2. **数据可靠性与规模** —— 从「单设备裸 IndexedDB」到「可迁移、可同步、可扩展的数据底座」
3. **账单接入广度** —— 从「三个固定来源」到「自学习通用导入」

**北极星**:v1.0 = 本地优先 + 端到端加密多设备同步。同步是可选插件,不是默认云化。

## 体检基线(现状)

- ✅ 绿:单测 27 过、构建通过、git 干净、已开源(MIT)
- ⚠️ 黄:lint 18 问题、测试仅 3 文件、无 E2E
- 🔴 核心债:AI 层无抽象且四份重复、无后端同步、Dexie 无 `upgrade()` 迁移、统计/去重全量 `toArray()` 内存聚合、账单来源硬编码、CSV 解析手写重复 3 份

---

## P0 · 卫生与还债(近期,~1–2 周)

目标:把基线拉回全绿,清掉已知正确性隐患。低风险高收益,不动架构。

- [x] **Lint 清零**:`SettingsPage` / `useBillTemplateLearning` / `EditDialog` / `ColumnMappingDialog` 的 render 阶段 ref 读写、effect/memo 内 setState、条件 hook —— 按 React 19 规范迁入 effect/事件回调
- [ ] **删 legacyParse**(`src/utils/import.ts:97`):300+ 行废弃 fallback,学习流稳定后移除
- [x] **硬去重快速路径**:导入前按 `amount+date+note` hash 预筛,精确重复不走 O(n²) 模糊路径
- [x] **导出修复**(`src/utils/export.ts`):CSV 加 BOM + 引号转义;JSON 加 `schemaVersion`
- [ ] **PWA 补图标**:manifest 已引用 192/512 PNG,`public/` 下只有 svg,生成位图
- [ ] **统一 CSV 解析**:`analyzer` / `universalParser` / `import` 三份手写合并为一份,处理 BOM 与多行引号字段
- [ ] **静默错误可观测**:`catch { /* noop */ }` 换成结构化日志 / Toast

## P1 · 架构升级(中期,~1–2 月)

目标:打地基,把「改一处痛四处」变成「注册即扩展」。

- [ ] **LLMClient 统一抽象**:收敛 4 份 fetch(`src/llm/service.ts` 三函数 + `src/bill-analyzer/aiMapper.ts`);Provider 适配器(OpenAI 兼容为基,预留 Anthropic/Google);抽 mock 边界让 LLM 可测
- [ ] **Task 注册抽象**:`{ prompt, parse, validate, fallback }` 注册式,新 AI 任务零改调度
- [ ] **Prompt 版本化**:版本号纳入 cacheKey,支持灰度迭代与旧缓存定向失效(解决「改 prompt 隐式使缓存失配」)
- [ ] **bill-analyzer 并入 llm 层**,消除 `aiMapper` 重复模式
- [ ] **Repository / 状态层**:引 repository 解耦 `useLiveQuery` 与业务,派生统计收敛(避免各 hook 重复实例化 `useLiveQuery`)
- [ ] **Dexie 迁移框架**:补 `upgrade()` + schema 校验 + 迁移单测,支撑未来字段重命名 / 类型变更
- [ ] **测试补齐**:DB CRUD / 备份恢复 / 导入导出 / NLP / 模板匹配单测;Playwright E2E 覆盖核心流(记账 -> 导入 -> AI 工作台 -> 去重)
- [ ] **结构化输出**:provider 支持时用 JSON schema / function calling 替代正则提取,替代 `src/llm/prompt.ts` 三层 fallback
- [ ] **加密审计**:`src/llm/crypto.ts:1` 硬编码 passphrase + 盐存 localStorage,明确威胁模型,规划用户密码派生迁移路径

## P2 · 体验与能力(中长期,~2–4 月)

目标:从「能用」到「好用」,拓宽接入与可观测。

- [ ] **流式输出**:审计 / 摘要走 SSE 流式,长任务体感提升
- [ ] **并发分批 + 限流**:Promise 池替代顺序循环,大数据集提速
- [ ] **成本可观测性**:记录 token 用量,按任务 / 月聚合,设置页展示消耗
- [ ] **PDF / 截图 OCR 导入**:`parseFileToGrid` 新分支,票据图片 -> 交易
- [ ] **泛化账单来源**:`BillSource` 改 string,内置模板数据驱动;导入 dry-run 预检报告(去重预筛 + 分类预览)
- [ ] **多币种**:`Transaction` 加 `currency`,金额解析支持币种识别
- [ ] **分类规则可视化**:暴露 `filterRules` / `sourceCategoryMap` / 关键词词典到 UI 编辑;合并 `categoryMatcher` 与 `sourceCategoryMap` 两套规则
- [ ] **性能**:统计改 Dexie 聚合 / 物化视图;明细页虚拟滚动;大文件流式分块导入
- [ ] **日期解析增强**:`universalParser.normalizeDate` 支持 `dateFormat` transform,多格式容错

## P3 · 同步与生态(长期,愿景 v1.0)

目标:解决「单设备」这一最大产品瓶颈,隐私不妥协。

- [ ] **可选自托管同步后端**:REST/WS + 设备 ID + 版本向量;本地优先,同步为可选
- [ ] **端到端加密同步**:同步前 WebCrypto / libsodium 加密,服务端零知识
- [ ] **CRDT 多设备**:Yjs / Automerge 去中心化冲突解决
- [ ] **备份冗余**:File System API 导出本地文件 / 加密上云(解决备份与数据同库、库清则同归于尽)
- [ ] **加密强化**:passphrase 改用户密码派生或 WebAuthn
- [ ] **多模态**:图片 / 语音 -> 交易

---

## 明确不做(边界)

- 不做云原生 SaaS —— 坚守本地优先,同步可选而非默认
- 不做复杂多用户 / 家庭账本 —— 同步成熟后再议
- 不盲目堆 provider —— 先抽象,再按需扩

## 度量

- 基线门:lint 0 / 单测覆盖 >60% / E2E 核心流绿 / 首屏 gzip <180kB
- 同步上线后:多设备冲突率、同步延迟、API 成本 / 月

## 优先级逻辑

P0 是纯卫生(不改架构、降风险);P1 是让后续每一项都不再痛的地基(LLMClient / Task / Repository / 迁移 / 测试);P2 在地基上长体验;P3 是产品跃迁。AI 层重构和数据层迁移必须先于同步,否则同步层会建在散沙上。
