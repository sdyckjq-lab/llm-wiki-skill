# Changelog

## v3.0.5 (2026-04-22)

### 新增

- 新增 `scripts/lib/source-signal-eligibility.js` 共享模块，统一 6 种页面类型的来源信号（source-signal）资格判定逻辑
- 新增 `scripts/source-signal-coverage.js` 批量扫描脚本，输出 JSON 格式的覆盖情况汇总
- lint 报告新增"检查 4：source-signal 覆盖情况"，按原因分组列出未参与页面
- status 工作流新增覆盖数据汇报步骤，报告模板增加"图谱来源信号覆盖"摘要

### 改进

- 从 `graph-analysis.js` 提取约 115 行重复的 frontmatter 解析和来源解析函数到共享模块，graph 回归测试全部通过
- README 先决条件更新：来源信号覆盖检查需要 `node`

### 测试

- 新增 31 个 JS 单元/集成测试（`source-signal-eligibility.test.js` 25 个 + `source-signal-coverage.test.js` 6 个），覆盖全部 5 种资格原因
- 新增 `tests/lint-output.regression-1.sh` lint 输出 golden diff 回归
- `tests/regression.sh` 集成 JS 单测和 lint 回归

## v3.0.4 (2026-04-22)

### 新增

- 新增根 `HERMES.md` 与 `platforms/hermes/README.md`，让 Hermes 进入仓库时能走自己的安装入口，不再误吃 Codex 专属提示
- `install.sh` 与 `scripts/runtime-context.sh` 新增 `hermes` 平台支持，默认技能目录为 `~/.hermes/skills/llm-wiki`
- `README.md`、`README.en.md`、`SKILL.md` 补齐 Hermes 平台说明与 metadata，保持共享核心不分叉

### 测试

- `tests/regression.sh` 新增 Hermes 安装与入口文档断言，继续兜住四平台安装矩阵
- README 结构断言扩展到 Hermes 安装、升级与根 `HERMES.md` 提示

### 致谢

- 感谢 [Zihan Zhao](https://github.com/ZZXX-bit) 贡献 Hermes 平台支持

## v3.0.3 (2026-04-21)

### 新增

- 图谱 2.0 第一段：`build-graph-data.sh` 现在会生成边权重、来源信号可用性、Louvain 社区和规则 insights，输出稳定写入 `wiki/graph-data.json`
- wash 图谱前端新增强弱边视觉分层、邻居强度指示和 Insights 面板，离线 HTML 可以直接查看惊人连接 / 知识缺口 / 桥节点
- 新增 `scripts/graph-analysis.js` 和 3 组 graph 回归，覆盖 helper 算法、Node/helper 失败路径、Insights 面板接线

### 改进

- `templates/source-template.md` 补齐 `sources: []` 契约，图谱权重可用来源重叠信号，不再靠旧的平面连线
- 图谱搜索改为预计算索引，避免每次输入都重新扫描全文内容
- 图谱基础构建运行时要求现在显式为 `jq` + `node`

## v3.0.2 (2026-04-21)

### 修复

- 图谱页在缺少小地图或相邻节点区 DOM 片段时不再因空引用中断，折叠状态初始化更稳
- `cardDims()` 与 `truncateLabel()` 统一使用字素簇宽度计算，长标签和复杂 emoji 的截断结果保持一致
- `tests/regression.sh` 的升级回归改为在移除 `.git` 的仓库副本里执行，避免安装测试被当前工作区状态干扰

### 测试

- 长标签、小地图、相邻节点折叠回归升级为 Node 运行时断言，覆盖 guard、状态切换和持久化行为
- 安装总回归补齐显式目标目录升级与 README 结构断言，继续兜住升级路径

## v3.0.1 (2026-04-21)

### 改进

- 图谱页品牌区改成直接链接 GitHub，宽屏工具栏按钮改为“图标 + 文字”，常用操作更容易发现
- 长标签节点改为安全截断并保留完整标题提示，避免卡片文字溢出
- 小地图和相邻节点区支持独立折叠，并记住上次展开状态
- 详情抽屉改成主内容优先、相邻节点辅区受限高度，长内容浏览更稳定
- 图谱样式补齐 `prefers-reduced-motion`、`aria-expanded`、键盘 Enter / Space 触发等无障碍细节

### 测试

- 新增 graph UX shell 回归：品牌链接、长标签截断、小地图折叠、工具栏标签、邻居区折叠、a11y
- `tests/regression.sh` 现在会串行执行上述图谱 UX 回归，避免总回归漏跑

## v3.0.0 (2026-04-20)

### 新增

- **水彩卡片风交互式知识图谱**：`build-graph-html.sh` 生成 `wiki/knowledge-graph.html`，使用 d3 + rough.js 水彩卡片风格，离线双击即可查看（搜索、过滤、社区聚类、节点详情抽屉）
- `templates/graph-styles/wash/`：wash 水彩卡片图谱模板（header / footer / graph-wash.js）
- `deps/d3.min.js`、`deps/rough.min.js`：本地 vendor，不依赖 CDN
- `tests/graph-html-styles.regression-1.sh`：回归测试覆盖本地 vendor、模板注入和离线资产复制

### 移除

- classic（vis-network）和 paper（手绘笔记本）图谱风格及相关模板、vendor 资产
- `--style` 参数和二参数兼容调用方式

### 改进

- `scripts/build-graph-html.sh`：简化为 wash-only 单风格输出，接口更简洁
- 图谱运行时：读取内嵌 `graph-data` JSON，并对 markdown 详情面板做 DOMPurify 清洗

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
