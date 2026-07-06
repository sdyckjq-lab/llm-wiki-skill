# 前端交互测试与 Paper 视觉回归栈

**背景**：现有前端测试以 `node:test` 和 `renderToStaticMarkup` 为主，只能证明静态输出，无法证明按钮点击、键盘快捷键、localStorage 外观偏好、抽屉拖拽和顶栏模型切换真的可用。Paper UI 迁移是高交互改动，继续只靠静态测试会漏掉真实用户路径。

**决策**：
1. **引入 DOM 交互测试**：前端 dev 依赖加入 `jsdom` 与 `@testing-library/react`，并提供统一 test setup，覆盖点击、键盘、localStorage 和 document dataset。
2. **引入 Playwright 视觉回归脚本**：为 Paper 主题组合、长对话、抽屉和响应式视口提供可重复截图入口。Playwright 只作为前端开发 / 验收依赖，不引入新 UI 框架。
3. **阶段验收真实运行**：每个阶段继续保留 typecheck / build / test；最终阶段必须运行 lint、浏览器主流程和 Paper 视觉截图脚本。
4. **性能样本进入验收**：长对话、搜索大列表、纸张纹理和字体兜底必须有固定样本，避免视觉迁移只验证空页面。

**与既有 ADR 的关系**：延续 ADR-8（React + Vite）、ADR-9（shadcn/ui）和 §5.5 的真实事件流原则；不改变后端、Skill 或图谱引擎测试策略。
