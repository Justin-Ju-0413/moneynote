# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
