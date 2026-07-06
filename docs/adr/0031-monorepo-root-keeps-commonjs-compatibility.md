# 根目录保持 CommonJS 兼容

monorepo 根目录不设置 `"type": "module"`。Skill 形态已有脚本和测试仍需要 CommonJS 兼容；工作台和共享图谱引擎如果需要 ESM，就在各自 package 里单独声明。

**备选方案**

- 根目录统一改成 ESM：看起来更现代，但会迫使成熟 Skill 测试和脚本一起迁移，风险大于收益。
- 全仓都保持 CommonJS：能兼容 Skill，但会拖累工作台、Vite 和图谱引擎的现代前端构建方式。

**影响**

- 根目录 `package.json` 不加 `"type": "module"`。
- `workbench/server`、`workbench/web` 和 `packages/graph-engine` 可以在自己的 `package.json` 里声明 ESM。
- 以后不要把“统一成 ESM”当成无风险清理；要改就先迁移 Skill 脚本和测试。
