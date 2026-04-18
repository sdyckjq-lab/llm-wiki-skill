# TODOs

## After Multi-Platform Adaptation

- 规划素材提取能力的内收顺序，先评估网页、PDF、本地文件、YouTube，再评估 X 等高波动来源。
- 评估是否需要为 OpenClaw 增加 workspace-skill fallback，而不只支持 shared skill 路径。
- 评估是否需要把安装器拆分成更正式的 `doctor` / `migrate` / `uninstall` 子命令。
- 评估第四个平台接入时的适配层模板，确保不回流到“复制一套主逻辑”。

## Phase B - 核心主线与外挂分离（已完成）

- 已冻结统一素材入口和单一来源总表
- 已明确外挂失败状态和统一回退路径
- 已锁住旧知识库兼容与迁移规则
- 已对齐安装、状态、说明和回归测试

## Phase 1b - 交互式图谱进阶功能（Phase 1 落地后再评）

- **What**（Phase 1 eng review 原列 3 项）：为已落地的交互式图谱新增 AI 隐含关系推断、图谱健康摘要（孤立节点 / 最大连通分量 / 脆弱桥接）、以及边置信度分级着色。
- **What（2026-04-17 design review 追加 5 项）**：
  1. 搜索升级：fuzzy 匹配 + 中英跨语言 alias（Phase 1 只做 prefix + case-insensitive）
  2. 深色模式：`prefers-color-scheme` 自动切；节点 palette 和边 opacity 要再调一次
  3. 设计系统抽离：把 Pass 4 CSS 变量块从 graph-template 抽到 `templates/design-tokens.css`，根目录写正式 `DESIGN.md`
  4. 真正的响应式：替换掉 Phase 1 的 MOBILE opt-out 覆盖层，做 `< 768px` 下单栏堆叠 + 触摸手势 pan/zoom
  5. 图谱演化指标（5-year 视图）：对比上次 graph 的节点度变化、新社区、新孤立节点；写入 `wiki/graph-history/{date}.json`
- **Why**：Phase 1 MVP 先验证有人会用本地 HTML 图谱，避免一步吃下所有 token 成本与维护负担。上面 8 项都是"截图再升级一档"的加戏。
- **Pros**：让图谱更接近 llm-wiki-agent 的能力覆盖；健康摘要给可量化质量信号；搜索和响应式覆盖更多使用场景；演化指标让用户看到"我的知识形状"变化。
- **Cons**：AI 推断每次 graph 要读全部实体页，100+ 节点时 token 消耗明显；深色模式要双份 CSS；演化指标要引入历史数据目录和对比逻辑。
- **Context**：Phase 1（2026-04-17 设计文档 approved，含 Eng Review Addenda + Design Review Addenda）只复用 ingest 已有的 confidence 数据，不重新调 AI。
- **Depends on / blocked by**：Phase 1（交互式图谱 MVP）落地并有至少一位真实用户反馈。
