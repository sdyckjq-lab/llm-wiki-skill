# 模型认证完全复用 pi-agent 的 auth 体系（三层 fallback）

**不**在 llm-wiki-agent 自己维护 API key 存储。所有凭证最终落到 pi-agent 的 `~/.pi/agent/auth.json`，由 pi-agent SDK 统一读取与刷新。

**三层 fallback（按推荐顺序）**：

1. **复用 pi CLI 登录态**（推荐）
   - 用户在终端跑 `pi login`，选择 Claude Pro/Max / ChatGPT Plus / GitHub Copilot OAuth，或填 Anthropic / OpenAI 等 API key
   - 凭证由 pi CLI 写入 `~/.pi/agent/auth.json`（权限 0600）
   - 我们的 app 通过 `AuthStorage.create()` 自动读取
   - **UX 等价于 open-design 的"复用本地 CLI"**：登录一次，到处可用
2. **UI 内填 API key**
   - 设置面板里直接填 Anthropic / OpenAI 等 key
   - app 写入 **同一个** `~/.pi/agent/auth.json`，不是我们自己的 config 文件
   - 测试连接按钮验证有效
3. **环境变量**
   - 用户在 shell 里 `export ANTHROPIC_API_KEY=...`
   - pi-agent SDK 自动检测
   - 设置面板只读显示当前环境变量状态

**关键约束**：
- llm-wiki-agent 的 `config.json` **不存任何 key**，只存 UI 偏好、外部库登记、默认模型等元数据
- 想用 Claude Pro/Max 订阅的用户**零成本**接入（这是 BYOK API key 路线给不了的礼物）
- macOS Keychain / 1Password 等高级用法通过 auth.json 的 `!shell command` 语法支持，不需要我们额外做
