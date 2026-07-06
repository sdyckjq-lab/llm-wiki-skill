# 不抄 open-design 的"多 CLI 子进程"模式

open-design 通过启动 CLI 子进程（Claude Code / Codex / Cursor 等 16 个）来实现"复用本地 CLI"，因为它要兼容多家协议。

我们只用 pi-agent SDK，已经覆盖所有主流 provider（Anthropic / OpenAI / Google / DeepSeek / Bedrock / Azure / xAI / OpenRouter ...）。不需要再做 CLI 检测和子进程管理。

未来如果某用户极度想用某 CLI 驱动 llm-wiki，可作为可选适配层加进来，但**不进阶段一-五主线**。
