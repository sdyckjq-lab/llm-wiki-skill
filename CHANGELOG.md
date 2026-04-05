# Changelog

## v0.4.0 (2026-04-05)

### 新增

- 多平台原生入口：同时支持 Claude Code、Codex、OpenClaw
- 统一安装器 `install.sh`：按平台一键安装主 skill 和打包依赖
- 平台适配文档：新增 `platforms/claude/CLAUDE.md`、`platforms/codex/AGENTS.md`、`platforms/openclaw/README.md`
- 安装回归用例：覆盖 Claude dry-run、多平台歧义检测、OpenClaw 安装与自定义路径
- 需求与实施文档：新增多平台需求说明、实施计划和后续 TODO

### 改进

- `README.md`：改成多平台总入口，明确 agent-first 安装方式
- `CLAUDE.md`、`AGENTS.md`：收敛成各平台入口文件，不再把仓库写死为单平台项目
- `SKILL.md`、`init-wiki.sh`、schema 模板：去掉平台专属话术，改成通用 agent 表达
- `setup.sh`：保留旧入口，但改为统一安装器的兼容包装，避免双份逻辑长期分叉

## v0.3.0 (2026-04-05)

### 新增

- `digest` 工作流：跨素材生成深度综合报告
- `graph` 工作流：生成 Mermaid 知识图谱可视化
- `batch-ingest` 工作流：批量消化文件夹中的素材
- 双语支持（中文 / English）
- `tests/regression.sh` 回归测试脚本

### 修复

- `setup.sh`：修复 `declare -A` 在 macOS 默认 bash 3.2 上崩溃的问题，改用兼容写法
- `setup.sh`：Chrome 检查改为检测 9222 调试端口，不再只看进程名；未开调试模式时给出正确启动命令
- `setup.sh`：新增 `uv` 检查，避免 YouTube 字幕提取时缺依赖无提示
- `init-wiki.sh`：修复 `{{LANGUAGE}}` 占位符未被替换的问题
- `init-wiki.sh`：修复路径含特殊字符时可能写坏配置文件的问题
- `SKILL.md`：补上 batch-ingest 缺失的步骤 2
- 模板：删除 entity/source/topic 模板中无意义的空 `[[]]` 链接
- `SKILL.md`：收窄 description 触发范围，避免非知识库场景误触发

### 改进

- README：新增"前置条件"和"常见问题"部分
- README：补充 digest、graph 使用示例
- 一键安装：`setup.sh` 集成 bun/npm install + Chrome 检查

## v0.2.0 (2026-04-04)

### 新增

- 多知识库支持（CWD 检查 + `~/.llm-wiki-path` 回退）
- Chrome + 依赖检查前置
- 一键安装（clone + setup.sh 一条命令）
- 双语模板（动态生成，不拆分模板文件）
- 打包依赖 skill 到 `deps/`，无需网络安装

## v0.1.0 (2026-04-04)

### 新增

- 初始化知识库（init 工作流）
- 消化素材（ingest 工作流）：URL 自动路由、内容分级处理
- 查询知识库（query 工作流）
- 健康检查（lint 工作流）：孤立页面、断链、矛盾信息、索引一致性
- 查看状态（status 工作流）
- Obsidian 兼容的双向链接 `[[页面名]]`
