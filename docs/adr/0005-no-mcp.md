# 不用 MCP

- MCP 是跨进程 RPC，每个能力一个独立 server，本地场景过重
- Skill 是 markdown + scripts，进程内执行，简单一个量级
- pi-agent 的 Skill 加载机制已足够
- 未来如果某个能力**必须**用 MCP（比如调云端服务），再单独接入
