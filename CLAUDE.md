# CLAUDE.md

这是 llm-wiki 在 Claude Code 下的入口文件。

先看这三个文件：

- [README.md](README.md)：多平台总说明
- [platforms/claude/CLAUDE.md](platforms/claude/CLAUDE.md)：Claude 专属入口提示
- [SKILL.md](SKILL.md)：核心能力和工作流

## Claude 安装动作

如果当前任务是安装这个 skill，优先执行：

```bash
bash install.sh --platform claude
```

这会把 llm-wiki 安装到 `~/.claude/skills/llm-wiki`，同时准备好仓库里自带的依赖 skill。

## 兼容说明

- `setup.sh` 仍然保留，给老的 Claude 安装方式继续用
- `setup.sh` 现在只是 `install.sh --platform claude` 的兼容包装
- 不要把这个仓库当成 Claude 专属仓库；Codex 和 OpenClaw 也共用同一套核心内容

## 使用顺序

安装完成后，按 [SKILL.md](SKILL.md) 中的工作流继续执行：

1. `init`
2. `ingest`
3. `batch-ingest`
4. `query`
5. `digest`
6. `lint`
7. `status`
8. `graph`
