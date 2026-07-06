# llm-wiki 工作台前端

这是 `llm-wiki 工作台` 的 React 前端包，不是独立 Vite 模板项目。日常开发从 monorepo 根启动和验证。

## 先读什么

- 工作台整体规则：[../AGENTS.md](../AGENTS.md)
- 产品事实和边界：[../PRODUCT.md](../PRODUCT.md)
- 前端代码入口：`src/`

## 常用命令

从仓库根执行：

```bash
npm run dev
npm run lint -w @llm-wiki-agent/web
npm run test -w @llm-wiki-agent/web
npm run visual:paper -w @llm-wiki-agent/web
```

前端端口固定为 `5180`。改 UI 后要实际打开页面检查关键流程。
