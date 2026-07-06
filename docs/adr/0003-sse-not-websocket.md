# SSE 而非 WebSocket

- agent → UI 是**单向**事件流
- SSE 是 HTTP 标准，浏览器和 webview 原生支持，断线自动重连
- WebSocket 需管理双向状态机，本场景过度
