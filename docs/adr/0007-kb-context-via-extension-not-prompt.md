# 知识库上下文用 Extension 注入，不拼 prompt

- 拼 prompt 难以维护、容易污染、对模型不友好
- pi-agent Extension 可以注册自定义 tool 并持有应用状态
- 让 agent 通过 tool 调用获取"当前在哪个库"、"库的元数据"，行为更可控
- 切库时 Extension 状态变化即可，不需要重建 session
