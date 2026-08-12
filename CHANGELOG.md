# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.0] - 2026-08-12

### Added

- **AI 学习规则进化**（B 层）：
  - 匹配增强：规则剥离渠道前缀后参与包含匹配（「财付通-美团」可命中「美团外卖」），单字规则防误命中，核心词最长优先
  - 命中计量与效果可视化：每条规则记录累计命中/最近命中时间；设置页统计条「N 条规则 · 累计命中 X 次 · 约节省 X 次 LLM 调用」
  - 冲突自愈：删除规则或改判分类时自动撤回已提炼的分类关键词；llm→manual 升级后学习计数重置为 1
  - 冷规则清理：一键清理 180 天未命中的规则（确认后执行）
  - 规则独立导出/导入：JSON 文件迁移学习习惯，导入跳过已存在规则（含隐私提示）
- **E2E 进 CI**：quality + e2e 双 job，Playwright 失败自动上传报告
- **发布自动化**：`node scripts/release.mjs`（版本 bump → CHANGELOG 校验 → tag → GitHub Release，`--publish` 支持保护分支）

### Changed

- **P1-4 AI 列映射并入 LLM 抽象层**：bill-analyzer 手写管道收敛为 mappingTask 描述符，对外 API 不变
- **P1-3 Prompt 版本化**：分类/审计缓存键纳入 prompt 版本，改 prompt 自动失效旧缓存

### Fixed

- 学习规则删除/改判后分类关键词残留导致的分类冲突
- 单字学习规则（如「餐」）误命中任意含该字文本

## [1.3.0] - 2026-08-11

### Added

- **AI 学习进化本地识别**：新增 `learningRules` 表（DB v12）沉淀商户→分类映射，本地识别越来越准、LLM 调用越来越少
  - 匹配链服务：学习规则（manual 优先于 llm）→ 分类关键词（内置+自定义）→ LLM 统一入口
  - 4 个学习触发点：聊天确认记录、明细改分类、AI 工作台采纳建议、LLM 高置信度结果
  - 关键词提炼：manual ≥1 次 / llm ≥3 次、≥2 字、剥离渠道前缀后自动写入分类关键词
  - 设置页学习规则管理 UI（查看来源/命中次数/删除）
  - 修复 `matchCategory` 自定义分类关键词编辑不生效的 bug
- Playwright E2E 覆盖核心流:聊天记账(record/modify/delete)、账单导入、AI 工作台审计、智能查重、学习规则管理;LLM 请求经 page.route 拦截 mock,零生产代码改动,本地 `npm run test:e2e` 运行
- 单测补齐:backup(8)、import(6)、db CRUD(7)、templateMatcher(9)、NLP 子模块(19)、learningRules/匹配链,共 +49 用例

### Changed

- 版本号统一:`APP_VERSION` 与 package.json 同步为 1.3.0

## [1.2.0] - 2026-08-01

### Added

- PWA 新版本更新提示弹窗(registerType: prompt),已安装用户可感知并主动刷新到新版本
- 增加无需 API Key 的合成示例账单、恢复/迁移/隐私说明和表格导入边界测试

### Changed

- Excel 解析器改为 `read-excel-file`；仅接受 `.xlsx`，单文件上限 20 MB，旧 `.xls` 需先转换

## [1.1.0] - 2026-07-23

### Added
- 明细页分类筛选支持支出/收入分组切换,避免 14 个 chip 收支混排
- 编辑弹窗新增收支类型切换,可修正误记的收支方向(原 type 锁定)
- 统一确认弹窗(ConfirmDialog)替代 6 处浏览器原生 confirm
- schema 迁移框架:upgrade() 用法注释 + 表/索引/CRUD 契约单测(fake-indexeddb)

### Changed
- 统计聚合改走 [type+date] 复合索引,大库时月度汇总与聊天上下文不再全量加载 transactions
- xlsx 换为 @e965/xlsx(API 兼容,零逻辑变化)

### Fixed
- LLM endpoint 带 /v1 时拼接双拼致 404,归一化后无论是否带 /v1 都拼出正确路径
- todayExpense 用 UTC 日期,UTC+8 凌晨误判为昨天致今日支出显示 ¥0,改用本地日期
- 备注清理误吞助词「了」(「午餐吃了34」备注变「午餐吃」),保留助词
- crypto 加密失败静默降级为裸 Base64(等于明文存 key),改为抛错

### Security
- xlsx@0.18.5 原型污染 + ReDoS 漏洞,换 @e965/xlsx@0.20.3 修复
- crypto API Key 加密不再有明文降级路径

## [1.0.0] - 2026-07

首个公开版本:ChatGPT 式聊天记账(记/查/改/删)、账单导入(支付宝/微信/平安)+ 模板自学习、AI 工作台(审计/归类/查重/月度摘要)、统计/预算/明细、本地优先 + API Key AES-GCM 加密 + 请求脱敏、PWA。
