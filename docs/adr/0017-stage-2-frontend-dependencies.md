# 阶段二新增前端依赖（react-markdown + cmdk）

**背景**：阶段二引入 markdown 渲染（右抽屉显示 wiki 页面）+ 命令补全菜单（`/` 和 `@`）。两个能力都需要新依赖。

**决策**（已在当前 monorepo 的 `workbench/web/package.json` 落地；旧工作台时期路径为 `web/package.json`）：

| 依赖 | 版本 | 用途 |
|---|---|---|
| `react-markdown` | ^9 | assistant 消息 + 右抽屉的 markdown 渲染 |
| `remark-gfm` | ^4 | GFM 支持：表格、任务列表、自动链接 |
| `cmdk` | ^1 | `/` 命令菜单 + `@` 引用菜单底层（即 shadcn `<Command>` 基础） |

**拒绝项**：
- marked / markdown-it：生态/类型/插件不如 react-markdown 稳
- Radix Popover 自写：键盘导航与 a11y 都要重写，工作量大

**与 ADR-9（shadcn/ui）的关系**：cmdk 即 shadcn 官方 Command 底层；react-markdown 在 shadcn 生态里是社区主流选型。两者都与现有 UI 体系自然契合，无破坏性。

**长期**：阶段三引入产出类 Skill（docx / pdf / pptx）+ open-design 设计 Skill 时，UI 端会需要更多依赖（PPT 渲染、文件预览等）。届时再补 ADR-18+。
