#!/bin/bash
# llm-wiki 依赖安装脚本
# 从 deps/ 目录安装素材提取所需的配套 skill
set -e

SKILLS_DIR="$HOME/.claude/skills"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/deps"

# 颜色输出
info()  { echo "\033[36m[信息]\033[0m $1"; }
ok()    { echo "\033[32m[完成]\033[0m $1"; }
warn()  { echo "\033[33m[警告]\033[0m $1"; }
err()   { echo "\033[31m[错误]\033[0m $1"; }

echo ""
echo "================================"
echo "  llm-wiki 依赖安装"
echo "================================"
echo ""

# 检查 deps 目录是否存在
if [ ! -d "$DEPS_DIR" ]; then
    err "未找到 deps/ 目录"
    echo "  请确保是从完整仓库克隆的（包含 deps/ 目录）"
    exit 1
fi

# 定义依赖：目录名 → 说明
declare -A DEPS
DEPS=(
    ["baoyu-url-to-markdown"]="网页和公众号文章提取"
    ["x-article-extractor"]="X (Twitter) 内容提取"
    ["youtube-transcript"]="YouTube 字幕提取"
)

INSTALLED=0
SKIPPED=0
MISSING_SOURCE=()

for skill_name in "${!DEPS[@]}"; do
    if [ -d "$SKILLS_DIR/$skill_name" ]; then
        ok "$skill_name 已安装（${DEPS[$skill_name]}）"
        SKIPPED=$((SKIPPED + 1))
    elif [ -d "$DEPS_DIR/$skill_name" ]; then
        info "安装 $skill_name（${DEPS[$skill_name]}）..."
        cp -r "$DEPS_DIR/$skill_name" "$SKILLS_DIR/$skill_name"
        ok "$skill_name 安装完成"
        INSTALLED=$((INSTALLED + 1))
    else
        warn "$skill_name：deps/ 中未找到源文件"
        MISSING_SOURCE+=("$skill_name")
    fi
done

echo ""
echo "================================"

if [ $INSTALLED -gt 0 ]; then
    ok "新安装 $INSTALLED 个依赖，跳过 $SKIPPED 个（已存在）"
fi

if [ ${#MISSING_SOURCE[@]} -gt 0 ]; then
    echo ""
    warn "以下 skill 在 deps/ 中缺失，可尝试手动安装："
    for skill_name in "${MISSING_SOURCE[@]}"; do
        echo "  npx skills add $skill_name"
    done
fi

# 自动安装 baoyu-url-to-markdown 的 Node 依赖
BAOYU_DIR="$SKILLS_DIR/baoyu-url-to-markdown/scripts"
if [ -d "$BAOYU_DIR" ] && [ -f "$BAOYU_DIR/package.json" ]; then
    if [ ! -d "$BAOYU_DIR/node_modules" ]; then
        info "安装 baoyu-url-to-markdown 的 Node 依赖..."
        if command -v bun &> /dev/null; then
            (cd "$BAOYU_DIR" && bun install) || { warn "bun install 失败，跳过（可手动粘贴文本作为替代）"; }
            [ -d "$BAOYU_DIR/node_modules" ] && ok "bun install 完成"
        elif command -v npm &> /dev/null; then
            (cd "$BAOYU_DIR" && npm install) || { warn "npm install 失败，跳过（可手动粘贴文本作为替代）"; }
            [ -d "$BAOYU_DIR/node_modules" ] && ok "npm install 完成"
        else
            warn "未找到 bun 或 npm，无法安装 Node 依赖"
            echo "  推荐安装 bun：curl -fsSL https://bun.sh/install | bash"
            echo "  安装后重新运行本脚本即可"
        fi
    else
        ok "baoyu-url-to-markdown 的 Node 依赖已存在"
    fi
fi

echo ""
echo "================================"
echo "  环境检查"
echo "================================"
echo ""

# Chrome 检查（仅提示，不阻塞）
if pgrep -x "Google Chrome" > /dev/null 2>&1; then
    ok "Chrome 正在运行"
else
    info "Chrome 当前未运行。baoyu-url-to-markdown 会在需要时尝试自动启动 Chrome"
    echo "  如果提取失败，手动启动 Chrome 后重试即可"
fi

echo ""
echo "提示：即使部分依赖缺失，llm-wiki 仍可使用："
echo "  - 缺少 baoyu-url-to-markdown → 无法自动提取网页/公众号"
echo "  - 缺少 x-article-extractor → 无法自动提取 X/Twitter 内容"
echo "  - 缺少 youtube-transcript → 无法自动提取 YouTube 字幕"
echo "  - 上述情况可以手动粘贴文本内容作为替代"
