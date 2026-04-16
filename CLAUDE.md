# CLAUDE.md

先看这三个文件：

- [README.md](README.md)：多平台总说明
- [platforms/claude/CLAUDE.md](platforms/claude/CLAUDE.md)：Claude 专属入口提示
- [SKILL.md](SKILL.md)：核心能力和工作流

## Claude 安装动作

如果当前任务是安装这个 skill，优先执行：

```bash
bash install.sh --platform claude
```

> `setup.sh` 是 `install.sh --platform claude` 的兼容包装，老用户可以继续用。

默认只准备知识库核心主线。如果这次要自动提取网页 / X / 微信公众号 / YouTube / 知乎，再执行：

```bash
bash install.sh --platform claude --with-optional-adapters
```

安装完成后，还会一并带上 `/llm-wiki-upgrade`。以后要更新核心主线，可以直接让 Claude 执行这个命令。

## 分支管理规则

改动代码（非纯文档/注释）时，按以下流程操作：

1. 开新分支：从 main 创建，命名用 feat/ 或 fix/ 前缀（如 fix/cache-reliability-write-through）
2. 分步 commit：每完成一个逻辑单元就提交（脚本实现 → 测试 → 文档更新，分开 commit）
3. 推送并创建 PR：推到远端后用 `gh pr create` 创建 PR
4. 合并：确认测试通过后在 GitHub 上合并

不需要开分支的情况：
- 只改了 CLAUDE.md、文档、注释
- 只是探索性阅读代码

设计文档或 plan 写完准备动手改代码时，也先开分支再开始实现。

## 推送前测试规则

每次 `git push` 前必须验证，按改动范围选深度：

### 第一层：快速检查（Claude Code 直接跑，1 分钟内）

不管改了什么都跑这 3 项：

1. `bash install.sh --dry-run --platform codex` — 安装脚本不报错
2. 改过的脚本如果有 `tests/fixtures/`，跑一下 diff 预期输出
3. `grep -r '/Users/kangjiaqi\|康佳琦' scripts/ templates/ tests/ SKILL.md` — 没泄露隐私路径

### 第二/三层：工作流测试（你在 codex 终端手动跑）

- **第二层**（只改了 SKILL.md 里个别工作流）：Claude Code 生成测试提示词写到文件，告诉你路径，你复制到 codex 跑涉及的工作流
- **第三层**（多工作流改动 / 版本号升级）：Claude Code 生成全量回归提示词，你在 codex 跑完整流程（init → ingest → lint → digest → graph）

素材复用 `~/Desktop/llm-wiki-cowork-test/raw-input/` 里的 3 篇文章，不用每次重新找。

codex 跑完后把 `test-report.md` 发回来，Claude Code 确认无阻塞问题后才执行 `git push`。

## 推送前文档更新规则

每次 commit 含功能改动（feat/fix）后、`git push` 前，**必须**主动检查并更新以下文档，不需要用户提醒：

1. **CHANGELOG.md**：在顶部加新版本条目（日期、新增/改进/修复分类）
2. **README.md 功能列表**：新增功能或行为变化时，在"功能"章节补一条
3. **版本号**：如果改动涉及新功能，在 CHANGELOG 条目里用新版本号（按 v当前+1 递增）

跳过条件：纯文档/排版/注释改动不需要更新。
