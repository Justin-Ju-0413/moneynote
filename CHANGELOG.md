# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范,版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.7.0] - 2026-09-15

### Added

- **LLM 流式输出**：`llmChat` 支持 SSE 流式（`stream.onDelta` 增量回调，返回值与非流式一致）；provider 忽略 stream 参数时自动降级整包解析；首页 AI 回复打字机式渐进渲染；AI 工作台月度摘要流式呈现；E2E mock 支持 SSE 假流（跨 chunk 粘包覆盖）（+32 单测：SSE 解析器 18 / client 流式与降级 12 / task 穿透 2）
- **明细页规模化**：Dexie schema v13 → v14（transactions 新增 `note` 索引，零数据迁移）；筛选查询索引下推（search > category > 日期 > type 主索引优先 + 候选集交集）替换全量内存加载；新增日期范围 + 金额区间筛选（联动防抖 + 一键清除）；`@tanstack/react-virtual` 虚拟滚动（按日分组头扁平化 + 36/64px 定行高）；修复筛选态哨兵不渲染导致结果截断 50 条的存量问题（+11 单测）
- **统计深度**：月环比/同比柱状图 `MonthCompareChart`（本月/上月/去年同月三柱，去年同月有数据即显示；涨跌语义色 pill）；分类完整排行榜（「展开全部 N 个」+ 较上期环比箭头，上期口径随日/月/年周期自动切换）（+8 单测）
- **预算增强**：预算弹窗显示近 3 个完整月分类均值建议（剔除当月）；预警分档 ≥80% amber / ≥100% danger（新增 `--color-warning` 亮暗 token）；总预算卡日均可用余额（除零防御）
- **设置页信息架构重组**：AI 智能（默认）/ 数据 / 外观 / 危险区四组 tab 子导航（胶囊分段器 + aria tab 语义，仅渲染当前组）；危险操作隔离区（danger 边框 + 实时缓存条数 + 后果明示，ConfirmDialog 流不变）；常驻「关于」卡

### Changed

- 备注搜索语义从全表子串内存扫描收窄为索引前缀匹配（`startsWithIgnoreCase`，中文无大小写影响）；`filterTransactions` 纯函数保留兜底

## [1.6.0] - 2026-09-15

### Changed

- **视觉与交互焕新（现代亲和风，R1 批次）**：
  - 设计 token 重塑：圆角 2px → 卡片 12px / 按钮输入 10px、卡片柔和双层阴影、标题从衬线大写改为无衬线 semibold、点阵纹理调淡（暗色模式全部同步镜像）
  - **lucide SVG 图标系统全量替换 emoji**：13 个分类图标（按分类 id 映射渲染，老数据零迁移，自定义分类显示首字头像）+ 6 个导航图标（桌面侧栏药丸态 / 移动底栏图标竖排）+ 4 个 AI 任务图标；AI 建议类型色值入语义 token（`--color-task-*`，暗色自动提亮）
  - 组件风格清扫：删除 70 处 `uppercase`、33 处 `tracking-widest` 及配套旧字距，84 处 10px 微标签提升为 11px
  - 首页：聊天气泡差异化（用户实底 / AI 柔和底）、输入区圆角化 + 圆形发送钮；统计页：公共 `ChartTooltip` 组件（CSS 变量深色跟随）替换两处硬编码、图例色点化、空状态统一；明细页列表按日分组卡片化；预算页进度条胶囊化、超支警示语义色柔和化
  - Dialog 键盘交互补课：Esc 关闭、Tab 焦点圈定、关闭后焦点归还、`role="dialog"` 无障碍语义；UpdatePrompt 复用 Button 组件

## [1.5.0] - 2026-09-15

### Added

- **桌面应用（Tauri 2）**：`npm run desktop:build` 把同一套前端打包成 macOS 原生应用（.app + dmg），双击直接使用（无需 dev server），**关闭窗口即退出**，单实例防重复打开；`desktop:install` 一键装入 /Applications；`desktop:dev` 带热重载开发
- **深色模式**（PR #23）：跟随系统 + 手动三态切换（浅色/深色/跟随系统，设置页「外观」卡）；`index.html` 内联脚本首帧前设主题防闪烁；recharts 图表自动跟随；实现说明见 `docs/specs/2026-09-11-dark-mode.md`
- **内置 OpenCode Go 服务商预设**（PR #19）：`opencode.ai/zen/go/v1`

### Changed

- **UI 一致性重构**（PR #21）：新增 `ui/Toggle`、`ui/Chip` 组件收敛重复样式；主题补 `danger`/`success` 语义色替换硬编码色值；`formatAmountSigned` 统一带符号金额；AI 工作台流水改为按需加载；Button/Card/输入框微交互精修
- **设置页拆分**（PR #22）：797 行单体拆为 `useLLMForm` / `useBillImport` hook + 4 个自包含区块组件（AI 解析 / 备份 / 模板 / 导入结果），页面瘦身为组装层；模板匹配改实时查询

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
