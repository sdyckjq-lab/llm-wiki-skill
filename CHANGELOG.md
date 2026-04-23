# Changelog

## v3.2.0 (2026-04-23)

### 新增

- 学习驾驶舱左侧社区导航面板：桌面端独立三列布局（导航 | 画布 | 抽屉），窄屏（<1024px）自动切换为 overlay
- 社区榜展示前 3 个社区（按 is_primary + node_count 排序），每个社区显示名称、节点数和来源数，primary 社区带 TOP 标记
- 点击社区切换到该社区的 community 视图，点击推荐起点进入 path 视图并自动展开抽屉
- 左中右联动：首次打开、点击社区、点击起点、点击节点、切换模式、切到全局，六种触发动作的完整状态一致性
- 社区切换后若当前选中节点不在新可见集内，自动关闭抽屉（drawer 漂移修复）
- 非 top-3 社区节点点击时显示内联提示，左侧高亮不跳转
- `graph-wash-helpers.js` 新增 `getCommunityNodeIds()` 运行时派生函数，任意社区的可见节点集合不再依赖 primary 预计算
- 新增 `tests/fixtures/graph-interactive-multicomm/` 多社区测试 fixture（4 社区、20 节点、30 边）

### 改进

- `graph-wash.js` 社区视图改为通过 `activeCommunityId` 运行时派生可见节点，不再复用 `learning.views.community.node_ids`
- 旧的 `renderLearningPanel()` 拆分为 `renderNavPanel()`（左侧导航）和 `updateInsightsTitle()`（标题同步），职责分离
- Insights 面板不再隐藏/替换，`#insights-body` 始终可见
- `focusNode()` 新增 `openDrawer` 参数，社区切换时可保持抽屉状态

### 测试

- 新增 `getCommunityNodeIds()` 3 个单元测试（正常匹配、不存在社区、空 community id）
- 更新 HTML 回归脚本：新增 nav-panel 相关 DOM hook 断言，删除旧 learning-body 断言
- `focusNode` 签名变更在两个回归脚本中同步更新

## v3.1.0 (2026-04-23)

### 新增

- 知识图谱新增「学习驾驶舱」：首次打开图谱时，自动展示推荐起点驱动的学习路径，而不是默认的全局视图
- 新增路径/社区/全局三种学习模式切换，路径模式聚焦推荐起点及其直接邻居，社区模式聚焦最大社区
- 侧边抽屉新增学习解释区：这是什么、为什么现在看、下一步看什么，引导用户渐进探索
- Insights 面板在学习模式下切换为学习入口，展示推荐起点和社区概览
- 搜索、小地图、底栏均适配子图模式，只搜索/显示/统计当前可见节点
- `graph-analysis.js` 新增 `buildLearning()` 预计算函数，构建时生成完整学习元数据（降级瀑布、社区统计、推荐起点）
- `graph-wash-helpers.js` 新增 6 个学习辅助函数（defaultLearning、normalizeLearning、resolveInitialMode、getVisibleNodeIds、getVisibleLinks、shouldAutoOpenDrawer）

### 测试

- 新增 `tests/js/graph-wash-learning.test.js`，20 个单元测试覆盖全部学习辅助函数
- 新增 `tests/graph-html-learning-cockpit.regression-1.sh`，5 个回归测试覆盖 HTML 壳、运行时钩子和既有功能兼容性
- 更新 `tests/expected/graph-data-sample.json` 和 `graph-data-empty.json` 金文件，反映新增的 learning 字段

## v3.0.7 (2026-04-22)

### 修复

- `graph-wash-helpers.js` 在 `Intl.Segmenter` 不可用时会把 ZWJ emoji、组合附加符和肤色修饰符并回同一段，旧运行时下的长标签截断不再拆坏家庭 emoji
- `graph-wash-helpers.js` 现在同时导出到浏览器全局和 CommonJS，避免桌面壳或混合运行时里 `graph-wash.js` 拿不到 helper 后整页不启动
- `build-graph-html.sh` 改为先复制全部 graph 资产，再替换最终 `knowledge-graph.html`，helper 缺失时不再把旧的可用 HTML 覆盖成坏产物

### 测试

- 新增 `tests/js/graph-wash-bootstrap.test.js`，覆盖 helper 缺失和 CommonJS + 浏览器双导出场景
- `tests/js/graph-wash-helpers.test.js` 补充 `Intl.Segmenter` fallback 下的家庭 emoji 边界断言
- `tests/graph-build-failures.regression-1.sh` 新增 helper 资产缺失时保留旧 HTML 的失败路径回归，`tests/regression.sh` 同步接入 bootstrap 单测

## v3.0.6 (2026-04-22)

### 新增

- 新增 `templates/graph-styles/wash/graph-wash-helpers.js`，把长标签截断、宽度估算和安全存储封装为可复用 helper，供浏览器运行时和 Node 单测共用
- 新增 `tests/js/graph-wash-helpers.test.js`，用 `node:test` 覆盖 grapheme 分段、宽度计算、标签截断、卡片尺寸和安全存储边界行为

### 改进

- `graph-wash.js` 改为从共享 helpers 读取 `truncateLabel`、`cardDims` 和 `createSafeStorage`，减少前端运行时里的重复逻辑
- `graph-wash.js` 在 `graph-wash-helpers.js` 缺失或加载失败时会显式报错并停止初始化，不再因为顶层解构直接抛出难定位的异常
- `build-graph-html.sh` 与 wash footer 现在会复制并先加载 `graph-wash-helpers.js`，长标签回归不再依赖 `vm` 从浏览器脚本抽函数
- `tests/regression.sh` 接入 `graph-html-styles`、`graph-html-search`、`graph-html-mobile` 三个遗漏回归，避免全量回归漏跑图谱场景

### 测试

- 新增 `graph-wash-helpers` JS 单测，并把它集成进 `tests/regression.sh`
- `graph-wash-helpers` 单测补充 `Intl.Segmenter` 不可用时的 fallback 分支和浏览器全局导出分支覆盖
- 更新 `graph-html-long-label.regression-1.sh` 与 `graph-html-styles.regression-1.sh`，验证 helpers 产物复制、脚本加载顺序和长标签行为

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
