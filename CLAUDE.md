# CLAUDE.md

本项目的开发规范、命令与 Git 工作流见 [`AGENTS.md`](AGENTS.md) —— 以该文件为准，本文件仅为 Claude Code 的入口指引。

请先阅读 `AGENTS.md` 并完全遵循，尤其：
- 提交前必须通过 `npm run lint` + `npm test` + `npm run build`
- `main` 受保护，代码变更一律走「分支 + PR」（`gh pr create`），squash 合并
- 新增功能必须带测试（单测 + 关键路径 E2E）
