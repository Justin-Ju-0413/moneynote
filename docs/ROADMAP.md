# MoneyNote 长期进化计划

> 状态:执行中 · 起草于 2026-07-15 · v2 刷新于 2026-08-11 · **v3 刷新于 2026-09-15**(1.5.0 收口积压 + 全面焕新计划 R 层启动)
> 依据:AI 层 / 数据骨架 / 账单解析与 NLP 三子系统审计;v2 对全部条目做了代码级核验(非仅文档),并纳入学习规则新资产

## 定位与进化主轴

MoneyNote 是**本地优先、隐私不妥协的 AI 记账 PWA**。四条进化主轴:

1. **AI 层收敛** —— 统一 LLM 平台(已建成 `llmChat` + `runTask` 注册抽象),消除残留手写管道,强化结构化输出与成本可观测
2. **本地识别进化** —— learningRules 学习闭环让「越用越准、越用越省」成为可量化的产品资产(新主轴)
3. **数据可靠性与规模** —— 从「单设备裸 IndexedDB」到「可迁移、可同步、可扩展的数据底座」
4. **账单接入广度** —— 从「三个固定来源」到「自学习通用导入」

**北极星**:v1.0 = 本地优先 + 端到端加密多设备同步。同步是可选插件,不是默认云化。

## 体检基线(2026-08-11 刷新)

- ✅ 绿:lint 0 / **单测 196(22 文件)** / 6 E2E spec(本地, mock LLM) / 构建通过 / git 干净 / 已开源(MIT)
- ⚠️ 黄:E2E 不进 CI;AI 工作台 / 去重 / 导出 / 明细搜索仍全量 `toArray()`;`aiMapper` 手写管道未并入 llm 层;prompt 无版本化
- 🔴 核心债:无后端同步(单设备最大瓶颈)、crypto 硬编码 passphrase、发布流程手动(v1.3.0 曾出现孤儿 tag)、学习规则仅精确匹配

## 已完成(截至 2026-08-11)

- [x] **P0 全部**(卫生 6 项:lint 清零 / 导出修复 / 删 legacyParse+统一 CSV / 硬去重快速路径 / PWA 图标 / 静默错误可观测)
- [x] **P1-1 LLMClient 统一抽象** —— 4 份 fetch 收敛为 `llmChat`,Provider 适配器为基
- [x] **P1-2 Task 注册抽象** —— `runTask` + `TaskDescriptor`,新任务零改调度
- [x] **P1-6 Dexie 迁移框架** —— `upgrade()` + schema 校验 + 迁移单测(现 v12)
- [x] **P1-7 测试补齐** —— 单测 27 → 196;Playwright 6 spec 覆盖核心流
- [x] **首页聊天记账** —— ChatGPT 式对话,record/query/modify/delete 四意图 + 确认制 + 持久化
- [x] **AI 学习进化本地识别**(v1.3.0) —— `learningRules` 表 + 匹配链(规则>关键词>LLM)+ 4 触发点 + 关键词提炼 + 设置页管理 UI
- [x] **P2-7 分类规则可视化(部分)** —— 关键词 UI 编辑 + 学习规则管理已交付;`filterRules`/`sourceCategoryMap` 合并未做(见 C6)

---

## A 层 · 巩固质量(近期,~1–2 周)

目标:补齐回归防线与残留结构债,全部低风险高收益,不做架构改动。

- [x] **A1 E2E 进 CI** —— 6 spec 目前仅本地跑。CI 加 Playwright job(`npx playwright install --with-deps chromium`,复用 mock LLM 拦截),回归防线自动化
- [x] **A2 P1-4 bill-analyzer 并入 llm 层** —— `aiMapper` 迁移为 `mappingTask` 描述符(`task.ts` 已留铺垫注释),消除唯一结构性重复,顺带统一错误文案
- [x] **A3 P1-3 Prompt 版本化** —— `promptVersion` 常量(parse/batch/audit/chat/mapping)并入缓存键,改 prompt 自动失效旧缓存,支持灰度迭代
- [x] **A4 发布自动化** —— 教训:v1.3.0 tag 曾落在孤儿提交上(双副本整合期遗留)。补 `scripts/release.mjs`(版本 bump → CHANGELOG 校验 → tag → release notes),`--dry-run` 可预览

## B 层 · 学习规则进化(产品主线,~2–4 周)

目标:把刚交付的学习闭环做成可量化的产品价值,并处理规模化后的规则冲突。

- [x] **B1 子串/归一化匹配** —— 现 `matchLearningRule` 仅商户全串精确匹配(「格林豪泰酒店」命中不了规则「格林豪泰」)。规则表加核心词派生索引(复用 `stripChannelPrefix`),策略:精确优先、子串兜底
- [x] **B2 规则冲突与衰减** —— 现 `hitCount` 只增不减;manual 覆盖 llm 时旧 llm 规则仍残留(可能学出矛盾规则)。方案:同商户多规则按 source 裁决;llm 规则被 manual 推翻达 N 次降级/删除;记录最后命中时间,冷规则可清理
- [x] **B3 学习效果可视化** —— 设置页加:规则命中率 / 「本季度 AI 帮你省了 X 次调用」。与 C2 成本可观测互哺,把「越用越省」显性化
- [x] **B4 学习规则独立导出/导入** —— 现随整库备份。拆独立迁移能力,老用户习惯零成本带走(注意:规则含消费习惯,导出前明示隐私)

## C 层 · 规模化与架构(中长期,~1–3 月)

目标:支撑大数据量 + 多用户场景,补完剩余架构债。

- [x] **C1 P1-5 Repository / 状态层** —— 引 repository 解耦 `useLiveQuery` 与业务,派生统计收敛(为同步层铺路)
- [x] **C2 性能规模化**(C2-a LLM 并发池 + C2-b 去重时间窗分桶 + 明细筛选态分页/搜索防抖) —— 三个全量 `toArray()` 热点:AI 工作台分批改 Promise 池+限流;去重改按 amount/日期分桶;明细搜索分页;剩余明细搜索 note/category 索引下推 + 虚拟滚动转入焕新批 R2
- [x] **C3 成本可观测**(原 P2 项) —— `llmChat` 返回补 usage → `aiUsage` 表(任务/模型/token/时间)→ 设置页月度消耗。流式 + 成本控制的前提
- [ ] **C4 P1-8 结构化输出** —— batch/audit 已用 `json_object`,升级 `json_schema`(DeepSeek/OpenAI 均支持)消灭 `prompt.ts` 三层 fallback 解析损耗
- [x] **C5 P1-9 加密审计** —— 明确威胁模型:现 passphrase 硬编码 + 盐存 localStorage,防明文泄露够用、防本机读取不足。规划用户密码派生迁移(`decryptApiKey` 兼容分支可复用,渐进重加密)
- [x] **C6 分类规则收敛**(原 P2 项，本批：删 ALIPAY_CATEGORY_MAP 重复 + 修复死代码分支；filterRules UI 记档后续批) —— 合并 `categoryMatcher` 与 `sourceCategoryMap` 两套规则;`filterRules` 暴露到 UI
- [ ] **C7 泛化账单来源 + OCR 导入**(原 P2 项) —— `BillSource` 改 string + 内置模板数据驱动;`parseFileToGrid` 加 PDF/截图 OCR 分支,一次解决「导入来源硬编码」结构债

## D 层 · 北极星(长期,P3,愿景 v1.0)

目标:解决「单设备」这一最大产品瓶颈,隐私不妥协。前置:C1 Repository 层 + C5 加密 + 版本向量设计。

- [ ] **D1 可选自托管同步后端** —— REST/WS + 设备 ID + 版本向量;本地优先,同步为可选
- [ ] **D2 端到端加密同步** —— 同步前 WebCrypto / libsodium 加密,服务端零知识
- [ ] **D3 CRDT 多设备** —— Yjs / Automerge 去中心化冲突解决
- [ ] **D4 备份冗余** —— File System API 导出本地文件 / 加密上云(解决备份与数据同库、库清则同归于尽)
- [ ] **D5 加密强化** —— passphrase 改用户密码派生或 WebAuthn
- [ ] **D6 多模态** —— 图片 / 语音 -> 交易

## 体验增强(随行队列,按产品节奏插队)

- [x] **桌面应用**（2026-09-11）—— Tauri 2 壳：双击即用（打包 dist，无需 dev server）、关窗即退出（覆盖 macOS 驻留默认）、单实例防重开；`desktop:build` 产出 .app/dmg，`desktop:install` 装入 /Applications
- [x] **深色模式**（2026-09-11,PR #23）—— 跟随系统 + 手动三态;全量 CSS 变量重定义实现,组件零主题分支;见 `docs/specs/2026-09-11-dark-mode.md`
- [ ] **流式输出** —— 审计 / 摘要走 SSE 流式,长任务体感提升(建议排在 C3 成本可观测之后)(纳入 R2)
- [ ] **多币种** —— `Transaction` 加 `currency`,金额解析支持币种识别
- [ ] **日期解析增强** —— `universalParser.normalizeDate` 支持 `dateFormat` transform,多格式容错
- [ ] **虚拟滚动** —— 明细页大数据量滚动体验(纳入 R2)

---

## R 层 · 全面焕新计划(2026-09-15 启动,详见 `docs/superpowers/plans/2026-09-15-renewal.md`)

四批次按依赖推进,每批次独立分支 + PR + 四门禁(lint/test/build/e2e),批末对应一个 minor 版本。

- [x] **R0 1.5.0 基线收口** —— 发布桌面应用/深色模式等 5 个 PR 积压;iCloud 冲突副本防再犯(.gitignore);README/ROADMAP 文档同步(2026-09-15,v1.5.0 已发布)
- [ ] **R1 视觉与交互焕新(v1.6.0)** —— 现代亲和风:token 重塑(圆角 2px→12px 档/柔和阴影/字阶);lucide SVG 图标系统替换 emoji(分类/导航/AI 任务);首页/统计/明细/预算核心页精修;Dialog 键盘交互补课(Esc/焦点归还)
- [ ] **R2 体验功能升级(v1.7.0)** —— 流式输出(SSE,体验队列队首);明细页规模化(DB v14 note/category 索引下推 + 日期/金额筛选 + 虚拟滚动);统计深度(月环比/同比/完整排行);设置页信息架构重组(分组子导航);预算建议与接近超支提醒
- [ ] **R3 质量基建加固(v1.8.0)** —— 组件/hook 测试层(testing-library + jsdom,优先 useChat/useDedup/useBillImport);vitest coverage + 阈值;E2E 扩面(统计/预算/备份恢复/深色模式/移动视口);CI 补强(concurrency/coverage);release.mjs 版本四处同步收口;备份异地化一键导出(D4 前半)
- [ ] **R4 深水区攻坚(v1.9.0)** —— C4 json_schema 结构化输出(provider 能力开关 + 降级链);C7 泛化账单来源(BillSource string + 模板数据驱动 + 截图导入走 LLM 视觉);D 层版本向量与同步协议设计文档(补齐 D 层最后一项前置)

R 批次收官后 C 层 7/7,D 层解封。

---

## 明确不做(边界)

- 不做云原生 SaaS —— 坚守本地优先,同步可选而非默认
- 不做复杂多用户 / 家庭账本 —— 同步成熟后再议
- 不盲目堆 provider —— 先抽象,再按需扩

## 度量

- 基线门:lint 0 / 单测覆盖 >60% / E2E 核心流绿(并进 CI)/ 首屏 gzip <180kB(上次实测 ~177kB)
- 学习闭环:B 层落地后跟踪「LLM 调用次数 / 月」下降曲线
- 同步上线后:多设备冲突率、同步延迟、API 成本 / 月

## 优先级逻辑

A 层是纯卫生(不改架构、降风险、补防线);B 层在产品主线(学习闭环)上长价值,见效快; C 层是地基(Repository / 性能 / 成本 / 加密),让 D 层同步不建在散沙上;D 层是产品跃迁。**A → B → C → D 的顺序即依赖顺序**;体验增强队列按产品节奏插入。
