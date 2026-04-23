#!/bin/bash
# 共享配置：被 install.sh / hook-session-start.sh / cache.sh / delete-helper.sh 等引用
# 微信公众号提取工具的 Git 仓库地址
WECHAT_TOOL_URL="git+https://github.com/jackwener/wechat-article-to-markdown.git"

# Python 命令检测：Windows 默认安装为 python.exe，不存在 python3 命令
# （Microsoft Store 的 python3 是安装提示 stub，运行会失败）
_detect_python_cmd() {
  if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
    echo "python3"
  elif command -v python >/dev/null 2>&1 && python -c "" >/dev/null 2>&1; then
    echo "python"
  else
    echo ""
  fi
}

if [ -z "${PYTHON_CMD:-}" ]; then
  PYTHON_CMD="$(_detect_python_cmd)"
  if [ -z "$PYTHON_CMD" ]; then
    echo "[llm-wiki] 错误：找不到可用的 Python 3，请先安装 Python 3.8+ 并加入 PATH" >&2
    return 1 2>/dev/null || exit 1
  fi
  export PYTHON_CMD
fi

# 统一 Python 子进程 stdout/stderr 编码为 UTF-8
# Windows 中文环境下 Python 无 TTY 时 sys.stdout.encoding 默认 gbk (cp936)，
# 会导致 Agent 通过 subprocess 读取的 JSON / 输出出现乱码 (issue #16)
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
