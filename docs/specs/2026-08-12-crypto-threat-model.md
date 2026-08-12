# API Key 加密威胁模型与迁移路线（C5 加密审计）

> 起草于 2026-08-12 · 对应 ROADMAP C5 / D5 · 代码：`src/llm/crypto.ts`

## 现状（2026-08-12）

- 密钥派生：`PASSPHRASE = 'moneynote-llm-key-protection-v1'`（源码硬编码）+ 设备盐（localStorage `moneynote_device_salt`，16 随机字节）→ PBKDF2-SHA256（100k 次）→ AES-GCM 256
- 密文格式：12 字节随机 IV + 密文，Base64 拼接存储（`db.settings.llm.apiKey`）
- 兼容：`decryptApiKey` 对 AES-GCM 失败的数据尝试按历史裸 Base64 读取（渐进迁移：下次保存重新加密）
- 失败语义（C5 本批加固）：`encryptApiKey` 失败**抛错**（绝不降级 Base64）；`decryptApiKey` 对非法密文**抛错**（不再静默返回空串）；调用方（`useLLMSettings`）捕获并告警，apiKey 置空

## 威胁模型

| 威胁 | 现状防护 | 评估 |
|---|---|---|
| 数据库导出（备份 JSON / IndexedDB 拷贝）明文泄露 | AES-GCM 加密，passphrase 不在数据内 | ✅ 防住（密钥材料不在导出物中） |
| 反编译 bundle 获取 passphrase 后离线破解 | 设备盐 + 100k PBKDF2 增加离线成本 | ⚠️ 部分防住（passphrase 随 bundle 下发，攻击者拿到 bundle + 导出的密文 + 盐可离线爆破；100k 迭代仅提高成本） |
| 本机同浏览器读取（拿到 localStorage + IndexedDB 访问权） | 无防护（密钥材料全部在本机可读处） | ❌ 防不住（浏览器模型下不可防；等同「攻击者完全控制用户会话」） |
| 意外损坏（盐丢失 / 密文截断） | C5 加固前静默返回空串（用户无感知丢失 Key） | ✅ 本批修复：显式抛错 + 告警，用户可重新输入 |

**结论**：当前方案对「防明文泄露」足够（威胁 1 完全防住）；「防本机读取」在纯浏览器模型下不可实现（威胁 4 是现实改进点，已加固）；passphrase 硬编码是已知妥协（威胁 2 部分防住）。

## 迁移路线（D5 远期）

目标：passphrase 改为用户密码派生（或 WebAuthn），消除硬编码妥协。

1. **密钥版本化**：密文前置版本字节（`v1` = 硬编码 passphrase，`v2` = 用户密码派生）；`decryptApiKey` 按版本选择派生路径
2. **渐进重加密**：首次输入用户密码后，读旧 v1 密文 → 用新 v2 重加密 → 写回（复用现有 legacy 兼容分支模式）
3. **密码丢失兜底**：v2 阶段提供「导出/导入备份」作为密码丢失逃生通道（备份为明文 JSON 或 v1 密文，用户知情）
4. **WebAuthn 备选**：passphrase 派生密钥可用硬件凭据绑定（`prf` 扩展）替代记忆密码

**前置**：本批已完成的失败显式化（保证迁移期间损坏数据可被感知）；`decryptApiKey` 的兼容分支结构（外层 AES → 内层 legacy）即为双密钥读取的现成骨架。
