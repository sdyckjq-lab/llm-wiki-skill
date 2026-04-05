# AGENTS.md

这是 llm-wiki 在 Codex 下的入口文件。

先看这三个文件：

- [README.md](README.md)：多平台总说明
- [platforms/codex/AGENTS.md](platforms/codex/AGENTS.md)：Codex 专属入口提示
- [SKILL.md](SKILL.md)：核心能力和工作流

## Codex 安装动作

如果当前任务是安装这个 skill，执行：

```bash
bash install.sh --platform codex
```

默认安装到 `~/.codex/skills/llm-wiki`。如果用户机器上还是旧的 `~/.Codex/skills`，安装器也会自动兼容。

## 重要提醒

- 不要把这个仓库当成 Codex 专属仓库；Claude Code 和 OpenClaw 也共用同一套核心内容
- 安装完成后，再按 [SKILL.md](SKILL.md) 的工作流继续做事
- 如果 OpenClaw 使用的是自定义技能目录，可以改用 `--target-dir`

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
