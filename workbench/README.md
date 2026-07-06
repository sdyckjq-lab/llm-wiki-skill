# llm-wiki 工作台

这是 llm-wiki monorepo 里的本地知识库工作台，位于 `workbench/`。它和 Skill 形态读写同一份知识库格式，但提供专门的对话、图谱和产出预览体验。

## 先读什么

不要默认翻历史归档。

| 你要做什么 | 先读 |
|---|---|
| 改工作台代码或体验 | 按当前 agent 选择 [AGENTS.md](AGENTS.md) 或 [CLAUDE.md](CLAUDE.md) 的冷启动表 + [PRODUCT.md](PRODUCT.md) 当前状态 |
| 看产品定位、边界和数据规则 | [PRODUCT.md](PRODUCT.md) |
| 改术语、能力归属或 ADR | [../CONTEXT-MAP.md](../CONTEXT-MAP.md) 指向的相关词表 + [../docs/adr/README.md](../docs/adr/README.md)；Skill / 工作台边界优先看 ADR-28 |
| 查旧阶段原计划、范围或验收标准 | [docs/archive/product-roadmap.md](docs/archive/product-roadmap.md) |
| 查实际完成记录、提交表或变更经过 | [docs/archive/product-history.md](docs/archive/product-history.md) |

## 开发

从 monorepo 根执行：

```bash
npm run dev
```

后端端口 `8787`，前端端口 `5180`。

## 环境要求

- Node `>=22.19.0`
- 推荐用 mise 或 nvm；仓库根有 `.mise.toml` 和 `.nvmrc`

更多命令见根目录 [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md)，按当前 agent 选择。
