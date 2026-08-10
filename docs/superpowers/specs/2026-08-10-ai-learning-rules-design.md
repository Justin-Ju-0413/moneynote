# MoneyNote AI 学习进化本地识别 — 设计文档

> 创建于 2026-08-10 · 状态：已批准
> 目标：让 AI（LLM）判断和用户纠正沉淀为本地规则，本地识别越来越准、LLM 调用越来越少

## 背景与现状

MoneyNote 识别体系目前三层：

| 层 | 实现 | 问题 |
|---|---|---|
| 本地规则 | `categoryMatcher.ts` 硬编码词典 + 支付宝分类映射 + 模板 sourceCategoryMap | 词典写死，改代码才能进化 |
| 缓存 | `classificationCache`（90 天 TTL）+ `parseCache` | LLM 结果只躺缓存，不沉淀规则 |
| LLM | 低置信度时调用，结果写缓存 | 判断完就结束，不反哺本地 |

**已发现的两个缺口：**
1. `db.categories.keywords`（分类关键词）从未被识别流程读取——设置页能编辑关键词，但 `matchCategory` 只查内置硬编码词典，编辑了不生效（`grep .keywords` 仅 CategoryManager 表单回显使用）
2. LLM 判断不反哺本地——用户确认/修改分类（聊天卡片确认、EditDialog 改分类、AI 工作台应用建议）不会让本地规则变聪明

## 用户已确认的决策

| 问题 | 决策 |
|---|---|
| 学习范围 | 两者都要：聊天 NLP 解析 + 账单导入分类共用一套机制 |
| 学习信号 | LLM 高置信度结果 + 用户纠正（manual 优先） |
| 规则形式 | 先商户精确映射，同一商户学到 N 次后提炼关键词加入分类 |
| 规则可见性 | 设置页可见、可删、可看来源 |
| 提炼门槛 | 同商户 LLM ≥3 次才提炼；manual 1 次即提炼；提炼词 ≥2 字 |
| 方案 | 方案 A：独立学习规则表 + 匹配优先级链 |

## 架构

### 1. 数据模型（新表 `learningRules`，DB v12）

```
learningRules
├─ id           自增主键（++id）
├─ merchant     商户/备注文本（学习键，索引 merchant）
├─ category     沉淀的分类（如 'food'）
├─ source       'llm' | 'manual'  ← manual（用户纠正）优先级高于 llm
├─ hitCount     累计学习/命中次数
├─ confidence   来源置信度
├─ createdAt    创建时间戳
├─ updatedAt    更新时间戳
```

- 加入 `BACKUP_TABLES`（`src/utils/backup.ts`），随备份/恢复走
- schema 升级：`this.version(12).stores({ learningRules: '++id, merchant' })`

### 2. 匹配优先级链（聊天解析 + 账单导入共用）

```
1. learningRules 商户精确匹配（manual 优先于 llm）
2. 分类关键词匹配（db.categories.keywords + 内置词典）   ← 同时修复现有 bug
3. 仍 low → LLM 调用
4. LLM 高置信度结果 → 写入 learningRules（source=llm）
```

- 修复：`matchCategory` 接入 `db.categories.keywords`（现在编辑了不生效）
- 匹配链封装为可复用函数，`parseInput`（聊天）与 `classifyBillRows`（导入）共用

### 3. 学习触发点（4 处）

| 触发 | 信号 | 写入 |
|---|---|---|
| 聊天确认记录（confirmCard） | 用户确认 | learningRules(source=manual) |
| EditDialog 改分类 | 用户纠正 | learningRules(source=manual) |
| AI 工作台应用建议 | 用户采纳 | learningRules(source=manual) |
| LLM 高置信度分类（导入批量 + 聊天增强） | 模型判断 | learningRules(source=llm) |

**优先级规则：**
- 同一 merchant 已存在 manual 规则时，llm 结果不覆盖（manual 优先）
- 同一 merchant 已存在 llm 规则时，manual 写入直接覆盖并升级

### 4. 关键词提炼

**提炼条件：**
- 同 merchant：source=manual 且 hitCount ≥1 → 提炼；source=llm 且 hitCount ≥3 → 提炼
- 提炼词 ≥2 字
- 剔除常见渠道前缀（如"银联渠道他代本借记卡""财付通-""支付宝（中国）网络技术有限公司-"等），剩余核心词 ≥2 字则写入该分类 `keywords`（去重）

### 5. 管理 UI（设置页新增「学习规则」区块）

- 列表展示：商户文本 → 分类、来源徽标（LLM/手动）、命中次数
- 每条可删除（防学错）
- 顶部小字说明："AI 根据你的确认和修正自动学习，识别会越来越准"

### 6. 与现有缓存的关系

- `classificationCache`（90 天 TTL 的 LLM 缓存）保留不变，作为 LLM 结果的短期缓存
- `learningRules` 是长期沉淀，两者不冲突

## 涉及文件

- `src/db/schema.ts` — v12 加表
- `src/db/types.ts` — LearningRule 类型 + AppDBSchema
- `src/utils/backup.ts` — BACKUP_TABLES 加 learningRules
- `src/nlp/categoryMatcher.ts` — 接入 db.categories.keywords（修复）+ 匹配链
- `src/nlp/learningRules.ts` — 新建：规则读写/优先级/提炼逻辑（纯函数，可测）
- `src/utils/billClassifier.ts` — 接入匹配链 + LLM 结果写入规则
- `src/nlp/index.ts` — 接入匹配链 + mergeLLMResult 后写入规则
- `src/hooks/useChat.ts` — confirmCard 写入 manual 规则
- `src/components/transaction/EditDialog.tsx` — 改分类写入 manual 规则
- `src/hooks/useAIWorkspace.ts` — applySuggestion 写入 manual 规则
- `src/pages/SettingsPage.tsx` — 新增学习规则管理区块（或独立组件）
- 测试：`src/nlp/learningRules.test.ts`、`src/nlp/categoryMatcher.test.ts`（扩展）、`e2e/specs/learning.spec.ts`

## 测试策略

| 层 | 内容 |
|---|---|
| 单元 | learningRules 读写/优先级（manual > llm）；匹配链（规则命中 > 关键词 > LLM）；提炼触发（manual 1 次 / llm ≥3 次 + ≥2 字 + 前缀剔除）；matchCategory 接入自定义 keywords 的修复测试 |
| E2E | 设置页学习规则可见可删；聊天确认后规则生成；改分类后规则生成；二次导入命中已学商户 |

## 收益

- 修复现有 bug（自定义关键词编辑了不生效）
- LLM 判断和用户纠正沉淀为本地规则，识别越来越准、LLM 调用越来越少（省钱、快）
- 完全本地存储，无隐私外泄
