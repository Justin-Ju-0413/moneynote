# 方案:ChatGPT 式聊天记账首页

## 决策(已与用户确认)
- **AI 能力**:记账 + 查询 + 修改(全功能助手)
- **对话历史**:持久化(IndexedDB 新表,Dexie v11)
- **记账确认**:卡片 + 确认按钮(修改/删除同样走确认,不自动入库)

## 架构:结构化意图分类 + 上下文注入(单次 LLM 调用/消息)

每条用户消息 → 1 次 LLM 调用,返回结构化意图 JSON → 本地执行 → 回复。
**不走 function calling**:可移植性更好(任意 OpenAI 兼容 provider)、复用 P1-2 `runTask`、单次调用更省。function calling 留待 P1-8。

意图:`record` / `query` / `modify` / `delete` / `chat`

**上下文注入**(每条消息刷新,让 LLM 能答查询、解析"刚才那笔"):最近 20 笔交易(id/date/amount/type/category/note)+ 本月&上月收支汇总 + 今日支出 + 本月分类汇总(约 1–2KB)。

## 数据模型(Dexie v11,仅加表,无数据变动)

```ts
interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string            // 文本(assistant 回复)
  createdAt: number
  intent?: 'record'|'query'|'modify'|'delete'|'chat'
  card?: {                   // 数据变更类意图的确认卡片
    kind: 'record'|'modify'|'delete'
    parsed?: ParsedTransaction      // record:待记交易
    txId?: number                   // modify/delete:目标交易 id
    before?: Partial<Transaction>   // modify:改前
    after?: Partial<Transaction>    // modify:改后
    status: 'pending'|'confirmed'|'cancelled'
  }
}
```

## 意图 schema(LLM 返回,`response_format: json_object`)

```json
{
  "intent": "record|query|modify|delete|chat",
  "transaction": {"amount":..,"type":"expense|income","category":..,"date":"YYYY-MM-DD","time":"HH:mm|null","note":..},
  "txId": 123,
  "changes": {"amount":..,"category":..,"note":..,"type":..,"date":..},
  "reply": "自然语言回复"
}
```

## 执行流程(useChat hook)

- **record**:assistant 消息带 pending 卡片 → 用户确认 → `addTransaction`,卡片 confirmed
- **modify**:按 txId 校验存在 → 带 before/after 卡片 → 确认 → `updateTransaction`
- **delete**:按 txId → 带删除卡片 → 确认 → `deleteTransaction`
- **query**:直接显示 reply(LLM 依注入上下文作答)
- **chat**:显示 reply
- **LLM 不可用**:回退本地 NLP `parseInput` 仅做 record;query/modify 提示需配置 AI

## 文件清单

**新增**
- `src/llm/chatPrompt.ts` — system prompt + 上下文构建 + 意图 parse
- `src/hooks/useChat.ts` — 聊天编排(消息收发、意图执行、确认)
- `src/components/chat/ChatMessageList.tsx` — 消息流(气泡 + 卡片)
- `src/components/chat/ChatInput.tsx` — 多行输入框(回车发送、Shift+回车换行)
- `src/components/chat/TransactionCard.tsx` — 确认卡片(从 ParsePreview 抽取)
- `src/llm/chatPrompt.test.ts` — 意图 parse 单测

**改动**
- `src/db/types.ts` — +ChatMessage
- `src/db/schema.ts` — v11 + `chatMessages: '++id, createdAt'`
- `src/llm/service.ts` — +`chatTask` 描述符 + `runChat`(复用 `runTask`,验证 P1-2 抽象价值)
- `src/llm/index.ts` — 导出 `runChat`
- `src/pages/HomePage.tsx` — 重写为聊天 UI(消息流 + 输入框 + 顶部精简摘要)
- `src/components/input/ParsePreview.tsx` — 卡片样式抽取到 TransactionCard(原单行输入流程随之移除)

## 分两阶段交付(各自可验证、单独提交)

**阶段 A — 聊天记账骨架**
`chatMessages` 表 + `useChat` + 聊天 UI + `record` 意图(卡片确认)+ LLM 不可用回退本地 NLP。
交付后:能聊天式记账、确认入库、历史持久化、刷新可回看。

**阶段 B — 查询 + 修改 + 删除**
扩展意图 schema + 上下文注入 + `modify`/`delete`/`query` 执行 + 卡片确认。
交付后:全功能助手("本月花了多少""把刚才那笔改成20""删掉昨天午餐")。

## 复用
- **P1-2 `runTask`**:`chatTask` 描述符,零改调度(新 AI 任务直接接入,印证 P1-2 的设计目标)
- **本地 NLP `parseInput`**:LLM 不可用时的 record 回退
- **ParsePreview 卡片样式** → `TransactionCard`
- **`useTransactions`** add/update/delete
- 现有设计系统(primary 蓝、`font-heading`、framer-motion、uppercase tracking 标签、`>` 提示符)

## 风险与对策
- **LLM 意图误判** → record/modify/delete 全走卡片确认(不自动入库),误判可取消
- **"刚才那笔"解析错** → 注入最近交易带 id,LLM 选 id;本地校验 id 存在,不存在则回复请用户澄清
- **上下文 token 成本** → 限 20 笔 + 汇总,约 1–2KB;`maxTokens: 800`(够推理模型推理+JSON)
- **Dexie v11 迁移** → 仅加表,低风险;现有 12 表不动
- **首屏 bundle** → 聊天 UI 为首屏,不再懒加载 HomePage;注意 framer-motion 已在首屏

## 验证
- 单测:`chatPrompt` 意图 parse、`useChat` 执行逻辑(mock `__setLLMTransport`)
- 浏览器预览:聊天记账全流程(记账/查询/修改/删除 + 确认 + 历史回看)
- `npm run lint` 0 / `npm test` 全绿 / `npm run build` 通过
- 不破坏现有功能:账单导入、AI 工作台、统计、明细
