# Changelog

## v3.0.0 (2026-04-20)

### 新增

- **三种交互式知识图谱风格**：`build-graph-html.sh` 默认一次生成 classic / paper / wash 三份 HTML，用户可直接双击对比选择
- `templates/graph-styles/paper/`、`templates/graph-styles/wash/`：新增两套离线可用的手绘风图谱模板
- `tests/graph-html-styles.regression-1.sh`：新增三风格生成回归测试，覆盖本地 vendor、模板注入和离线资产复制

### 改进

- `scripts/build-graph-html.sh`：新增 `--style classic|paper|wash|all`，保留旧二参数 classic 输出兼容，同时默认生成全部风格
- 手绘风图谱运行时：改为读取内嵌 `graph-data` JSON，并对 markdown 详情面板做 DOMPurify 清洗
- 图谱构建产物：手绘风依赖改为项目内本地 vendor，离线双击即可打开，不再依赖 CDN

## v2.6.0 (2026-04-17)

### 新增

- **交互式知识图谱 HTML**：双击 `wiki/knowledge-graph.html` 即可在浏览器中查看交互式知识图谱（搜索、过滤、社区聚类、节点详情抽屉、键盘快捷键）
- `scripts/build-graph-data.sh`：扫描 wiki 目录生成 `graph-data.json`（节点/边/社区聚类/U2 top-30 算法/2MB 降级保护）
- `scripts/build-graph-html.sh`：拼接 header + graph-data.json + footer 生成自包含 HTML，复制 vendor 资产
- `templates/graph-template-header.html`：品牌栏 + 工具条 + 三栏骨架 + CSS 变量 + ARIA
- `templates/graph-template-footer.html`：vis.js 初始化 + 11 个交互状态 + 键盘快捷键
- `templates/vis-network.min.js` + `marked.min.js` + `purify.min.js`：vendor 三件套及对应许可证
- `SKILL.md` 工作流 8 新增 Step 2b（生成 graph-data.json）和 Step 2c（生成 HTML）
- 14 个回归测试覆盖 build-graph-data.sh 和 build-graph-html.sh 的 13 条代码路径

### 修复

- `build-graph-data.sh`：bash 3.2 全角字符后 `$OUTPUT` 变量名误解析，改用 `${OUTPUT}` 显式定界

## v2.5.0 (2026-04-16)

### 新增

- `scripts/create-source-page.sh`：source 页面写入和缓存更新绑定为原子操作，写入后自动更新 `.wiki-cache.json`，失败时自动回滚
- `scripts/cache.sh check`：MISS 原因细分（`no_entry` / `hash_changed` / `no_source`），AI 可根据原因给出不同提示
- `scripts/cache.sh check`：自愈缓存检查，无 cache entry 但 source 页面存在时通过 filename stem 精确匹配自动修复（返回 `HIT(repaired)`）

### 改进

- `SKILL.md` ingest 工作流：source 页面写入改用 `create-source-page.sh`，Step 12 不再单独调用 `cache.sh update`

## v2.4.0 (2026-04-15)

### 新增

- `platforms/claude/companions/llm-wiki-upgrade/SKILL.md`：Claude 安装后随附 `/llm-wiki-upgrade`，以后可以直接从命令入口更新 llm-wiki

### 改进

- `install.sh`：恢复 Claude 专属伴生命令安装与升级同步，GitHub 地址安装和 `/llm-wiki-upgrade` 两条路线现在共享同一套更新边界
- `README.md`、`CLAUDE.md`、`platforms/claude/CLAUDE.md`：补充 `/llm-wiki-upgrade` 的使用说明，明确默认只更新核心主线

## v2.3.0 (2026-04-15)

### 改进

- `install.sh`：默认安装和默认升级只准备知识库核心主线；网页、X/Twitter、微信公众号、YouTube、知乎提取改为显式追加 `--with-optional-adapters`
- `README.md`、`AGENTS.md`、`CLAUDE.md`、平台入口：统一补充“核心默认可用、URL 自动提取按需开启”的说明，并澄清 `--target-dir` 需要传最终的 `llm-wiki` 目录

### 修复

- `install.sh`：修复 `--upgrade --target-dir <...>/llm-wiki` 被默认平台目录覆盖的问题，自定义技能目录现在会升级到正确位置
- `install.sh`：目标目录不存在时，升级命令现在明确失败，不再误报“升级完成”
- `scripts/adapter-state.sh` + `scripts/runtime-context.sh`：统一源码目录、已安装目录和升级目标目录的判断，避免状态检查在不同运行位置下漂移
- `tests/regression.sh`、`tests/adapter-state.sh`：回归矩阵改成保护“核心默认可用、可选提取显式开启”的新边界

## v2.2.0 (2026-04-14)

### 新增

- `scripts/lint-runner.sh`：lint 机械检查脚本（孤立页面 / 断链 / index 一致性），独立于 AI 判断
- `tests/fixtures/lint-sample-wiki/`：lint 脚本回归测试夹具（含 `C++` 特殊字符、别名链接 `[[X|显示]]`、孤立页面等边界情况）
- `tests/expected/lint-output.txt`：lint 脚本预期输出
- SKILL.md digest 多格式模板：深度报告、对比表、时间线三种输出格式及文件命名约定
- SKILL.md digest 路由表：新增"对比/时间线"触发词
- `templates/schema-template.md` 关系类型词汇表：可选的图谱关系标注词汇（实现/依赖/对比/矛盾/衍生）
- SKILL.md ingest 隐私自查：首次进入 ingest 必须确认的 y/n 隐私检查流程

### 改进

- SKILL.md lint 工作流：拆分为"Step 0 脚本机械检查 + AI 层面判断"两阶段
- SKILL.md graph 工作流：明确 AI 默认只画无标注箭头，关系词汇表仅供手动美化
- CLAUDE.md：新增"推送前测试规则"（三层验证策略），删除与 SKILL.md 重复的使用顺序列表

### 修复

- `lint-runner.sh`：`INDEX_FILE` 路径从 `$WIKI_DIR/index.md` 改为 `$WIKI_ROOT/index.md`（与 schema 约定的目录结构一致）
- 测试夹具 `lint-sample-wiki`：`index.md` 从 `wiki/` 移到知识库根目录，符合 schema 约定

## v2.1.0 (2026-04-13)

### 新增

- `scripts/validate-step1.sh`：ingest Step 1 JSON 格式验证脚本，检查必需字段和置信度值合法性
- `templates/synthesis-template.md`：crystallize 结晶化页面模板
- SKILL.md 置信度赋值规则：明确 EXTRACTED/INFERRED/AMBIGUOUS/UNVERIFIED 的判定标准
- SKILL.md Step 1 验证流程：Step 1 完成后调用 validate-step1.sh，失败自动回退
- SKILL.md 工作流 10 crystallize：对话内容沉淀为 wiki/synthesis/sessions/ 页面
- SKILL.md 路由表：新增 crystallize 关键词路由

### 改进

- `scripts/init-wiki.sh`：创建 `wiki/synthesis/sessions/` 子目录和 `.gitignore`（排除 `.wiki-tmp/`）
- `tests/regression.sh`：新增 9 个测试覆盖 validate-step1.sh 行为和 SKILL.md 内容锁定

## v2.0.0 (2026-04-11)

### 新增

- `purpose.md` 研究方向模板：初始化后直接生成，给后续整理提供明确方向
- `.wiki-cache.json` 本地缓存：为重复素材跳过提供基础设施
- `query` 结果持久化模板：支持把综合回答写回 `wiki/queries/`
- delete 工作流说明和辅助脚本：支持级联删除素材并扫描引用
- Claude Code `SessionStart hook` 支持：可在会话开始时注入 wiki 上下文提示

### 改进

- `SKILL.md`：重构 `ingest` 为两步流程，增加缓存检查、置信度标注和降级说明
- `SKILL.md`：`batch-ingest` 增加无变化跳过统计，`status` 增加 `purpose.md` 状态展示
- `SKILL.md`：`query` 增加重复检测、`derived: true` 标记和自引用防护
- `SKILL.md`：`lint` 增加置信度报告和 EXTRACTED 抽查说明
- `wiki-compat.sh`：兼容旧知识库时同时报告 `purpose.md` 和 `.wiki-cache.json` 状态
- `install.sh`：支持注册和移除 Claude Code 的 `SessionStart hook`
