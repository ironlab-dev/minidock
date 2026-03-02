#!/bin/bash
set -e

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$PROJECT_ROOT/.dev_state"

# 函数：获取进程的工作目录
get_process_cwd() {
    local pid=$1
    # 在 macOS 上，lsof 通常能可靠获取工作目录
    local cwd=$(lsof -p $pid -a -d cwd 2>/dev/null | awk 'NR==2 {print $NF}' || echo "")
    # 如果失败，尝试备用方法
    if [ -z "$cwd" ]; then
        cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n' | sed 's/^n//' || echo "")
    fi
    echo "$cwd"
}

# 函数：从进程命令行参数中提取端口
extract_port_from_cmd() {
    local cmd=$1
    if [[ "$cmd" =~ --port[[:space:]]+([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    elif [[ "$cmd" =~ -p[[:space:]]+([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    fi
}

# 函数：从目录名提取数字（提取所有连续数字）
extract_number_from_dirname() {
    local dirname=$(basename "$PROJECT_ROOT")
    # 提取所有连续数字，如 minidock2 -> 2, minidock23 -> 23
    echo "$dirname" | grep -oE '[0-9]+' | head -1
}

# 函数：检查端口是否被当前目录的服务占用
is_port_used_by_current_project() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -z "$pids" ]; then
        return 1  # 端口未被占用
    fi
    
    # 检查进程工作目录
    for pid in $pids; do
        local cwd=$(get_process_cwd $pid)
        if [[ "$cwd" == "$PROJECT_ROOT"* ]]; then
            return 0  # 被当前项目占用
        fi
    done
    
    # 检查 .dev_state 文件
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE" 2>/dev/null || true
        if [ "${FRONTEND_PORT:-}" = "$port" ] || [ "${BACKEND_PORT:-}" = "$port" ]; then
            return 0  # 在状态文件中记录
        fi
    fi
    
    return 1  # 被其他进程占用
}

# 函数：查找可用端口（从指定端口开始顺延）
find_available_port() {
    local start_port=$1
    local port=$start_port
    
    while [ $port -lt 65535 ]; do
        if ! is_port_used_by_current_project $port; then
            # 检查端口是否真的可用（未被任何进程占用）
            if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
                echo $port
                return 0
            fi
        fi
        port=$((port + 1))
    done
    
    echo ""  # 未找到可用端口
    return 1
}

# 函数：确定前端和后端端口
determine_ports() {
    local dir_number=$(extract_number_from_dirname)
    
    if [ -n "$dir_number" ]; then
        # 目录名包含数字，使用 23XXX 格式
        # 将数字补零到 3 位，然后加上前缀 23
        # 例如：2 -> 002 -> 23002, 23 -> 023 -> 23023, 234 -> 234 -> 23234
        local padded_number=$(printf "%03d" "$dir_number")
        FRONTEND_PORT="23${padded_number}"
    else
        # 目录名无数字，使用默认端口 23000
        FRONTEND_PORT=23000
        
        # 检查 23000 是否被占用（且不是当前项目）
        if is_port_used_by_current_project 23000 || lsof -Pi :23000 -sTCP:LISTEN -t >/dev/null 2>&1; then
            # 从 33000 开始顺延
            FRONTEND_PORT=$(find_available_port 33000)
            if [ -z "$FRONTEND_PORT" ]; then
                echo "❌ 无法找到可用端口（已尝试到 65534）"
                exit 1
            fi
        fi
    fi
    
    # 后端端口 = 前端端口 + 1000
    BACKEND_PORT=$((FRONTEND_PORT + 1000))
    
    # 验证后端端口是否可用
    if is_port_used_by_current_project $BACKEND_PORT || lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  警告: 后端端口 $BACKEND_PORT 已被占用，尝试查找替代端口..."
        BACKEND_PORT=$(find_available_port $((BACKEND_PORT + 1)))
        if [ -z "$BACKEND_PORT" ]; then
            echo "❌ 无法找到可用的后端端口"
            exit 1
        fi
        echo "   使用后端端口: $BACKEND_PORT"
    fi
}

# 函数：检测当前目录是否有运行的服务
check_running_services() {
    local found_backend=false
    local found_frontend=false
    local backend_pid=""
    local frontend_pid=""
    local backend_port=""
    local frontend_port=""
    
    # 检查后端进程（App serve 或 swift run App）
    local backend_pids=$(pgrep -f "App.*serve|swift.*run.*App.*serve" 2>/dev/null || true)
    if [ -n "$backend_pids" ]; then
        for pid in $backend_pids; do
            local cwd=$(get_process_cwd $pid)
            if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
                found_backend=true
                backend_pid=$pid
                local cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
                backend_port=$(extract_port_from_cmd "$cmd")
                break
            fi
        done
    fi
    
    # 检查前端进程（server.mjs 或 next dev）
    local frontend_pids=$(pgrep -f "node.*server\.mjs|next.*dev|npm.*run.*dev" 2>/dev/null || true)
    if [ -n "$frontend_pids" ]; then
        for pid in $frontend_pids; do
            local cwd=$(get_process_cwd $pid)
            if [[ "$cwd" == "$PROJECT_ROOT/web" ]] || [[ "$cwd" == "$PROJECT_ROOT/web/"* ]]; then
                found_frontend=true
                frontend_pid=$pid
                local cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
                frontend_port=$(extract_port_from_cmd "$cmd")
                break
            fi
        done
    fi
    
    # 如果状态文件存在，也检查状态文件中的信息
    # 但需要验证进程确实属于当前项目目录
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE"
        if [ -n "${BACKEND_PID:-}" ] && ps -p "${BACKEND_PID}" > /dev/null 2>&1; then
            # 验证进程的工作目录是否属于当前项目
            local state_cwd=$(get_process_cwd "${BACKEND_PID}")
            if [[ "$state_cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$state_cwd" == "$PROJECT_ROOT/backend/"* ]] || [[ -z "$state_cwd" ]]; then
                # 如果无法获取工作目录，至少验证进程命令包含项目路径或 App
                if [ -z "$state_cwd" ]; then
                    local state_cmd=$(ps -wwp "${BACKEND_PID}" -o args 2>/dev/null | tail -n 1 || echo "")
                    if [[ "$state_cmd" == *"$PROJECT_ROOT"* ]] || [[ "$state_cmd" == *"App"* ]]; then
                        found_backend=true
                        if [ -z "$backend_pid" ]; then
                            backend_pid="${BACKEND_PID}"
                        fi
                        if [ -z "$backend_port" ] && [ -n "${BACKEND_PORT:-}" ]; then
                            backend_port="${BACKEND_PORT}"
                        fi
                    fi
                else
                    found_backend=true
                    if [ -z "$backend_pid" ]; then
                        backend_pid="${BACKEND_PID}"
                    fi
                    if [ -z "$backend_port" ] && [ -n "${BACKEND_PORT:-}" ]; then
                        backend_port="${BACKEND_PORT}"
                    fi
                fi
            fi
        fi
        if [ -n "${FRONTEND_PID:-}" ] && ps -p "${FRONTEND_PID}" > /dev/null 2>&1; then
            # 验证进程的工作目录是否属于当前项目
            local state_cwd=$(get_process_cwd "${FRONTEND_PID}")
            if [[ "$state_cwd" == "$PROJECT_ROOT/web" ]] || [[ "$state_cwd" == "$PROJECT_ROOT/web/"* ]] || [[ -z "$state_cwd" ]]; then
                # 如果无法获取工作目录，至少验证进程命令包含项目路径或 next
                if [ -z "$state_cwd" ]; then
                    local state_cmd=$(ps -wwp "${FRONTEND_PID}" -o args 2>/dev/null | tail -n 1 || echo "")
                    if [[ "$state_cmd" == *"$PROJECT_ROOT"* ]] || [[ "$state_cmd" == *"next"* ]]; then
                        found_frontend=true
                        if [ -z "$frontend_pid" ]; then
                            frontend_pid="${FRONTEND_PID}"
                        fi
                        if [ -z "$frontend_port" ] && [ -n "${FRONTEND_PORT:-}" ]; then
                            frontend_port="${FRONTEND_PORT}"
                        fi
                    fi
                else
                    found_frontend=true
                    if [ -z "$frontend_pid" ]; then
                        frontend_pid="${FRONTEND_PID}"
                    fi
                    if [ -z "$frontend_port" ] && [ -n "${FRONTEND_PORT:-}" ]; then
                        frontend_port="${FRONTEND_PORT}"
                    fi
                fi
            fi
        fi
    fi
    
    # 返回结果
    if [ "$found_backend" = true ] || [ "$found_frontend" = true ]; then
        echo "BACKEND_RUNNING=$found_backend"
        echo "FRONTEND_RUNNING=$found_frontend"
        echo "BACKEND_PID=$backend_pid"
        echo "FRONTEND_PID=$frontend_pid"
        echo "BACKEND_PORT=$backend_port"
        echo "FRONTEND_PORT=$frontend_port"
        return 0
    else
        return 1
    fi
}

# --- Help Command ---
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]] || [[ "$1" == "help" ]]; then
    echo "用法: ./dev.sh [选项]"
    echo ""
    echo "描述:"
    echo "  启动 MiniDock 开发环境（后端 + 前端）"
    echo ""
    echo "选项:"
    echo "  --daemon, --background    后台模式运行（服务在后台运行，脚本立即退出）"
    echo ""
    echo "子命令:"
    echo "  status                    查看服务运行状态"
    echo "  logs [选项]               查看日志"
    echo "    --tail                  实时跟踪日志（类似 tail -f）"
    echo "    --backend               仅查看后端日志"
    echo "    --frontend              仅查看前端日志"
    echo "    --all                   查看所有日志（默认）"
    echo "    -n, --lines N           显示最近 N 行日志（默认: 50）"
    echo ""
    echo "示例:"
    echo "  ./dev.sh                 前台模式启动（默认）"
    echo "  ./dev.sh --daemon         后台模式启动"
    echo "  ./dev.sh status           查看服务状态"
    echo "  ./dev.sh logs             查看最近 50 行日志"
    echo "  ./dev.sh logs --tail      实时跟踪日志"
    echo "  ./dev.sh logs --backend --tail  实时跟踪后端日志"
    echo ""
    echo "日志文件:"
    echo "  - 后端:  backend/backend_output.log"
    echo "  - 前端:  web/frontend_output.log"
    echo ""
    exit 0
fi

# --- Parse Arguments ---
DAEMON_MODE=false
for arg in "$@"; do
    if [[ "$arg" == "--daemon" ]] || [[ "$arg" == "--background" ]]; then
        DAEMON_MODE=true
    fi
done

# --- Logs Command ---
if [[ "$1" == "logs" ]]; then
    shift
    LOG_TAIL=false
    LOG_BACKEND=false
    LOG_FRONTEND=false
    LOG_LINES=50
    
    # Parse log command arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tail)
                LOG_TAIL=true
                shift
                ;;
            --backend)
                LOG_BACKEND=true
                shift
                ;;
            --frontend)
                LOG_FRONTEND=true
                shift
                ;;
            --all)
                LOG_BACKEND=false
                LOG_FRONTEND=false
                shift
                ;;
            -n|--lines)
                LOG_LINES="$2"
                shift 2
                ;;
            *)
                echo "❌ 未知参数: $1"
                echo ""
                echo "用法: ./dev.sh logs [选项]"
                echo ""
                echo "选项:"
                echo "  --tail              实时跟踪日志（类似 tail -f）"
                echo "  --backend           仅查看后端日志"
                echo "  --frontend          仅查看前端日志"
                echo "  --all               查看所有日志（默认）"
                echo "  -n, --lines N       显示最近 N 行日志（默认: 50）"
                exit 1
                ;;
        esac
    done
    
    # Determine which logs to show
    if [ "$LOG_BACKEND" = false ] && [ "$LOG_FRONTEND" = false ]; then
        # Default: show all logs
        LOG_BACKEND=true
        LOG_FRONTEND=true
    fi
    
    BACKEND_LOG="$PROJECT_ROOT/backend/backend_output.log"
    FRONTEND_LOG="$PROJECT_ROOT/web/frontend_output.log"
    
    if [ "$LOG_TAIL" = true ]; then
        # Real-time log following
        if [ "$LOG_BACKEND" = true ] && [ "$LOG_FRONTEND" = true ]; then
            echo "📋 实时跟踪所有日志 (按 Ctrl+C 退出)..."
            echo ""
            # Use tail -f for both logs with prefixes
            (tail -f "$BACKEND_LOG" 2>/dev/null | while IFS= read -r line; do
                echo "[Backend] $line"
            done) &
            TAIL_BACKEND_PID=$!
            (tail -f "$FRONTEND_LOG" 2>/dev/null | while IFS= read -r line; do
                echo "[Frontend] $line"
            done) &
            TAIL_FRONTEND_PID=$!
            
            # Cleanup on exit
            trap "kill $TAIL_BACKEND_PID $TAIL_FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
            wait
        elif [ "$LOG_BACKEND" = true ]; then
            echo "📋 实时跟踪后端日志 (按 Ctrl+C 退出)..."
            echo ""
            tail -f "$BACKEND_LOG" 2>/dev/null
        elif [ "$LOG_FRONTEND" = true ]; then
            echo "📋 实时跟踪前端日志 (按 Ctrl+C 退出)..."
            echo ""
            tail -f "$FRONTEND_LOG" 2>/dev/null
        fi
    else
        # Show recent log lines
        if [ "$LOG_BACKEND" = true ] && [ "$LOG_FRONTEND" = true ]; then
            echo "📋 最近 $LOG_LINES 行日志:"
            echo ""
            if [ -f "$BACKEND_LOG" ]; then
                echo "=== 后端日志 ==="
                tail -n "$LOG_LINES" "$BACKEND_LOG" 2>/dev/null || echo "（日志文件为空或不存在）"
                echo ""
            else
                echo "=== 后端日志 ==="
                echo "（日志文件不存在）"
                echo ""
            fi
            if [ -f "$FRONTEND_LOG" ]; then
                echo "=== 前端日志 ==="
                tail -n "$LOG_LINES" "$FRONTEND_LOG" 2>/dev/null || echo "（日志文件为空或不存在）"
            else
                echo "=== 前端日志 ==="
                echo "（日志文件不存在）"
            fi
        elif [ "$LOG_BACKEND" = true ]; then
            echo "📋 后端日志 (最近 $LOG_LINES 行):"
            echo ""
            if [ -f "$BACKEND_LOG" ]; then
                tail -n "$LOG_LINES" "$BACKEND_LOG" 2>/dev/null || echo "（日志文件为空或不存在）"
            else
                echo "（日志文件不存在）"
            fi
        elif [ "$LOG_FRONTEND" = true ]; then
            echo "📋 前端日志 (最近 $LOG_LINES 行):"
            echo ""
            if [ -f "$FRONTEND_LOG" ]; then
                tail -n "$LOG_LINES" "$FRONTEND_LOG" 2>/dev/null || echo "（日志文件为空或不存在）"
            else
                echo "（日志文件不存在）"
            fi
        fi
    fi
    exit 0
fi

# --- Status Command ---
if [[ "$1" == "status" ]]; then
    # 使用 check_running_services 获取真实的运行状态 (比仅读取状态文件更准确)
    CHECK_RESULT=$(check_running_services 2>/dev/null || echo "")
    
    # 默认值
    DISP_BACKEND_RUNNING="NO"
    DISP_FRONTEND_RUNNING="NO"
    DISP_BACKEND_PID=""
    DISP_FRONTEND_PID=""
    DISP_BACKEND_PORT=""
    DISP_FRONTEND_PORT=""
    
    if [ -n "$CHECK_RESULT" ]; then
        eval "$CHECK_RESULT"
        if [ "$BACKEND_RUNNING" = true ]; then DISP_BACKEND_RUNNING="YES"; DISP_BACKEND_PID=$BACKEND_PID; DISP_BACKEND_PORT=$BACKEND_PORT; fi
        if [ "$FRONTEND_RUNNING" = true ]; then DISP_FRONTEND_RUNNING="YES"; DISP_FRONTEND_PID=$FRONTEND_PID; DISP_FRONTEND_PORT=$FRONTEND_PORT; fi
    fi

    echo "🔍 MiniDock Development Status:"
    if [ "$DISP_BACKEND_RUNNING" == "YES" ]; then
        echo "   - 🟢 Backend:  http://localhost:${DISP_BACKEND_PORT:-unknown} (PID: $DISP_BACKEND_PID)"
    else
        echo "   - 🔴 Backend:  Stopped"
    fi
    
    if [ "$DISP_FRONTEND_RUNNING" == "YES" ]; then
        echo "   - 🟢 Frontend: http://localhost:${DISP_FRONTEND_PORT:-unknown} (PID: $DISP_FRONTEND_PID)"
    else
        echo "   - 🔴 Frontend: Stopped"
    fi
    
    if [ "$DISP_BACKEND_RUNNING" == "YES" ] || [ "$DISP_FRONTEND_RUNNING" == "YES" ]; then
         if [ -n "$DISP_FRONTEND_PORT" ]; then
             echo ""
             echo "🔗 Quick Access: http://localhost:${DISP_FRONTEND_PORT}"
         fi
    else
         echo ""
         echo "ℹ️  No active services found."
    fi
    exit 0
fi

if [ "$DAEMON_MODE" = true ]; then
    echo "🛠️  Starting MiniDock in BACKGROUND MODE..."
    echo "   - Backend: Swift Debug Build (Hot Compile on Restart)"
    echo "   - Frontend: Next.js Dev Server (Hot Reload)"
    echo ""
else
    echo "🛠️  Starting MiniDock in DEVELOPMENT MODE..."
    echo "   - Backend: Swift Debug Build (Hot Compile on Restart)"
    echo "   - Frontend: Next.js Dev Server (Hot Reload)"
    echo ""
fi

# --- Dependency Check Functions ---

# 检查 Node.js 版本
check_node_version() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先运行 ./setup.sh"
        exit 1
    fi
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        echo "❌ Node.js 版本过低（需要 >= 18），当前版本: $(node -v)"
        echo "   请运行: brew upgrade node 或 ./setup.sh"
        exit 1
    fi
}

# 检查并安装前端依赖
ensure_frontend_deps() {
    cd "$PROJECT_ROOT/web"
    
    local needs_install=false
    
    # 检查 node_modules 是否存在
    if [ ! -d "node_modules" ]; then
        needs_install=true
        echo "📦 node_modules 目录不存在，需要安装依赖"
    else
        # 检查 package.json 或 package-lock.json 是否更新
        if [ "package.json" -nt "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
            needs_install=true
            echo "📦 package.json 或 package-lock.json 已更新，需要重新安装依赖"
        else
            # 验证关键依赖是否存在
            if ! npm ls next react react-dom --depth=0 &>/dev/null; then
                needs_install=true
                echo "📦 关键依赖缺失，需要重新安装"
            fi
        fi
    fi
    
    if [ "$needs_install" = true ]; then
        echo "📦 正在安装前端依赖..."
        if ! npm install --legacy-peer-deps; then
            echo "❌ 前端依赖安装失败"
            echo "   请检查："
            echo "   1. 网络连接是否正常"
            echo "   2. npm 配置是否正确"
            echo "   3. 或运行 ./setup.sh 重新安装"
            exit 1
        fi
        echo "✅ 前端依赖安装完成"
    else
        echo "✅ 前端依赖已就绪"
    fi
}

# 检查 Swift 工具链
check_swift_toolchain() {
    if ! command -v swift &> /dev/null; then
        echo "❌ Swift 未安装，请先运行 ./setup.sh"
        exit 1
    fi
    local swift_version=$(swift --version | head -n 1)
    echo "✅ Swift 工具链: $swift_version"
}

# 检查并解析后端依赖
ensure_backend_deps() {
    cd "$PROJECT_ROOT/backend"
    
    # 检查 Package.resolved 是否存在
    if [ ! -f "Package.resolved" ]; then
        echo "📦 Package.resolved 不存在，正在解析 Swift 依赖..."
        if ! swift package resolve; then
            echo "❌ Swift 依赖解析失败"
            echo "   请检查："
            echo "   1. 网络连接是否正常"
            echo "   2. Swift 工具链是否完整"
            echo "   3. 或运行 ./setup.sh 重新安装"
            exit 1
        fi
        echo "✅ Swift 依赖解析完成"
    else
        # 如果 Package.swift 更新，重新解析
        if [ "Package.swift" -nt "Package.resolved" ]; then
            echo "📦 Package.swift 已更新，正在更新 Swift 依赖..."
            if ! swift package resolve; then
                echo "❌ Swift 依赖更新失败"
                echo "   请检查网络连接或运行 ./setup.sh"
                exit 1
            fi
            echo "✅ Swift 依赖更新完成"
        else
            echo "✅ Swift 依赖已就绪"
        fi
    fi
}

# 等待后端健康检查
wait_for_backend_health() {
    local max_attempts=150
    local attempt=0
    local health_url="http://localhost:$BACKEND_PORT/health"
    local check_interval=0.2
    
    echo "⏳ 等待后端服务启动..."
    
    while [ $attempt -lt $max_attempts ]; do
        # 首先检查进程是否还在运行（早期检测）
        if [ -n "$BACKEND_PID" ] && ! ps -p "$BACKEND_PID" > /dev/null 2>&1; then
            echo "❌ 后端进程已退出"
            echo "   请检查日志: backend/backend_output.log"
            return 1
        fi
        
        # 检查健康端点（使用更短的超时时间）
        if curl -sf --max-time 0.5 --connect-timeout 0.3 "$health_url" > /dev/null 2>&1; then
            echo "✅ 后端服务已就绪"
            return 0
        fi
        
        attempt=$((attempt + 1))
        # 每 2.5 秒显示一次进度（0.2 * 12.5 = 2.5秒）
        if [ $((attempt % 13)) -eq 0 ]; then
            local elapsed=$((attempt * check_interval))
            echo "   等待中... (${elapsed}s)"
        fi
        sleep $check_interval
    done
    
    echo "❌ 后端服务启动超时（等待了 $((max_attempts * check_interval)) 秒）"
    echo "   请检查日志: backend/backend_output.log"
    echo "   常见问题："
    echo "   1. Swift 编译错误"
    echo "   2. 端口被占用"
    echo "   3. 数据库初始化失败"
    return 1
}

# --- Run Dependency Checks ---
echo "🔍 检查依赖..."
check_node_version
check_swift_toolchain
ensure_backend_deps
ensure_frontend_deps
echo ""

# --- Check for existing instance ---
# 使用增强的检测函数检查实际运行的服务
CHECK_RESULT=$(check_running_services 2>/dev/null || echo "")
if [ -n "$CHECK_RESULT" ]; then
    eval "$CHECK_RESULT"
    
    if [ "$BACKEND_RUNNING" = true ] || [ "$FRONTEND_RUNNING" = true ]; then
        echo "⚠️  警告: 当前目录已有 MiniDock 开发服务正在运行！"
        echo ""
        echo "   正在运行的服务:"
        if [ "$BACKEND_RUNNING" = true ]; then
            if [ -n "$BACKEND_PORT" ]; then
                echo "   - 🟢 后端服务:  http://localhost:$BACKEND_PORT (PID: $BACKEND_PID)"
            else
                echo "   - 🟢 后端服务:  (PID: $BACKEND_PID)"
            fi
        fi
        if [ "$FRONTEND_RUNNING" = true ]; then
            if [ -n "$FRONTEND_PORT" ]; then
                echo "   - 🟢 前端服务:  http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
            else
                echo "   - 🟢 前端服务:  (PID: $FRONTEND_PID)"
            fi
        fi
        if [ "$BACKEND_RUNNING" = true ] && [ "$FRONTEND_RUNNING" = true ] && [ -n "$FRONTEND_PORT" ]; then
            echo ""
            echo "   🔗 访问地址: http://localhost:$FRONTEND_PORT"
        fi
        echo ""
        echo "   如需停止当前服务，请执行: ./stop.sh"
        echo "   查看服务状态，请执行: ./dev.sh status"
        echo ""
        exit 1
    fi
else
    # 没有运行的服务，清理可能存在的过期状态文件
    if [ -f "$STATE_FILE" ]; then
        echo "🧹 清理过期的状态文件..."
        rm -f "$STATE_FILE"
    fi
fi

# --- Port Configuration ---
echo "🔍 确定端口配置..."
determine_ports

echo "🚀 Configuration:"
echo "   - Backend Port:  $BACKEND_PORT"
echo "   - Frontend Port: $FRONTEND_PORT"
echo ""

# Save State as early as possible
echo "Updating dev state file at: $STATE_FILE"
echo "BACKEND_PORT=$BACKEND_PORT" > "$STATE_FILE"
echo "FRONTEND_PORT=$FRONTEND_PORT" >> "$STATE_FILE"
echo "DAEMON_MODE=$DAEMON_MODE" >> "$STATE_FILE"
echo "BACKEND_LOG=$PROJECT_ROOT/backend/backend_output.log" >> "$STATE_FILE"
echo "FRONTEND_LOG=$PROJECT_ROOT/web/frontend_output.log" >> "$STATE_FILE"

# Create .env.local for Next.js
# Note: We don't set NEXT_PUBLIC_API_URL here to allow dynamic detection
# This enables LAN access (e.g., 10.0.0.62:23000) by using window.location.hostname
ENV_LOCAL="$PROJECT_ROOT/web/.env.local"
echo "# Generated by dev.sh - DO NOT EDIT" > "$ENV_LOCAL"
echo "# NEXT_PUBLIC_API_URL is not set to allow dynamic detection based on access URL" >> "$ENV_LOCAL"
echo "# Client will automatically detect backend port as frontend_port + 1000" >> "$ENV_LOCAL"
echo "NEXT_PUBLIC_PROJECT_ROOT=$PROJECT_ROOT" >> "$ENV_LOCAL"
# Support proxy mode for port forwarding scenarios (set USE_PROXY=true to enable)
if [ "${USE_PROXY:-false}" = "true" ]; then
    echo "NEXT_PUBLIC_USE_PROXY=true" >> "$ENV_LOCAL"
    echo "ℹ️  Proxy mode enabled (API calls will use /api/* relative paths)"
fi
echo "✅ Generated $ENV_LOCAL"

# --- Backend ---
cd "$PROJECT_ROOT/backend"

# Note: We don't export NEXT_PUBLIC_API_URL to allow dynamic detection
# This enables LAN access by using window.location.hostname in the client
export MINIDOCK_PROJECT_ROOT="$PROJECT_ROOT"

# Smart Backend Startup
BACKEND_BINARY=".build/debug/App"
NEEDS_BUILD=true

if [ -f "$BACKEND_BINARY" ]; then
    # Check if any BACKEND source file or package config is newer than the binary
    # Only check backend directory to avoid triggering rebuilds when frontend files change
    CHANGES=$(find "$PROJECT_ROOT/backend/Sources" "$PROJECT_ROOT/backend/Package.swift" "$PROJECT_ROOT/backend/Package.resolved" -newer "$BACKEND_BINARY" 2>/dev/null | head -n 1)
    if [ -z "$CHANGES" ]; then
        NEEDS_BUILD=false
    fi
fi

# 确保日志文件存在
touch backend_output.log

# 清理可能残留的旧 tail 进程（防止跨 session 的日志输出问题）
old_tail_pids=$(pgrep -f "tail.*backend_output.log" 2>/dev/null || true)
if [ -n "$old_tail_pids" ]; then
    for pid in $old_tail_pids; do
        cwd=$(get_process_cwd $pid)
        if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
            # 终止 tail 进程及其管道中的子进程
            pkill -TERM -P "$pid" 2>/dev/null || true
            kill -TERM "$pid" 2>/dev/null || true
            sleep 0.1
            pkill -KILL -P "$pid" 2>/dev/null || true
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done
fi

if [ "$NEEDS_BUILD" = true ]; then
    echo "📦 Starting Backend (Build & Run)..."
    # Use swift build with incremental compilation for faster builds
    # Build first, then run the binary for better process control and faster startup
    if swift build -c debug > backend_build.log 2>&1; then
        # Check if binary was actually updated to be newer than sources
        # Adding a small 1-second margin
        CHECK_AGAIN=$(find "$PROJECT_ROOT/backend/Sources" "$PROJECT_ROOT/backend/Package.swift" "$PROJECT_ROOT/backend/Package.resolved" -newer "$BACKEND_BINARY" 2>/dev/null | head -n 1)
        if [ -n "$CHECK_AGAIN" ]; then
            echo "⚠️  Swift build finished but binary is still older than sources. Forcing a clean build of App target..."
            # Try to just delete the binary and build again
            rm -f "$BACKEND_BINARY"
            if ! swift build -c debug > backend_build.log 2>&1; then
                 echo "❌ Forced build failed. Check backend_build.log"
                 exit 1
            fi
        fi
        "./$BACKEND_BINARY" serve --hostname 0.0.0.0 --port $BACKEND_PORT > backend_output.log 2>&1 &
    else
        echo "❌ Swift 编译失败，请检查错误信息:"
        cat backend_build.log
        rm -f backend_build.log
        exit 1
    fi
    rm -f backend_build.log
else
    echo "🚀 Starting Backend (Direct - Fast Path)..."
    "./$BACKEND_BINARY" serve --hostname 0.0.0.0 --port $BACKEND_PORT > backend_output.log 2>&1 &
fi
BACKEND_PID=$!
echo "BACKEND_PID=$BACKEND_PID" >> "$STATE_FILE"
echo "✅ Backend started (PID: $BACKEND_PID)"

# 在后台模式下不启动 tail -f
if [ "$DAEMON_MODE" = false ]; then
    echo "📋 Backend logs will be displayed below (prefixed with [Backend]):"
    # 使用 tail -f 实时显示日志，并添加前缀
    # 使用 stdbuf 确保输出不被缓冲
    (
        stdbuf -oL -eL tail -f backend_output.log 2>&1 | while IFS= read -r line; do
            echo "[Backend] $line"
        done
    ) &
    TAIL_PID=$!
    echo "TAIL_PID=$TAIL_PID" >> "$STATE_FILE"
else
    echo "📋 Backend logs: backend/backend_output.log"
fi

# --- Wait for Backend Health ---
# Export BACKEND_PID so wait_for_backend_health can access it
export BACKEND_PID
if ! wait_for_backend_health; then
    echo ""
    echo "⚠️  后端服务启动失败，前端将不会启动"
    echo "   请修复后端问题后重新运行 ./dev.sh"
    cleanup
    exit 1
fi
echo ""

# --- Frontend ---
echo "📦 Starting Frontend (Dev)..."
cd "$PROJECT_ROOT/web"

# 确保前端日志文件存在
touch frontend_output.log

if [ "$DAEMON_MODE" = false ]; then
    echo "▶️  Frontend launching... (Press Ctrl+C to stop both)"
else
    echo "▶️  Frontend launching..."
fi
echo "🔗 Access MiniDock at: http://localhost:$FRONTEND_PORT"
# Try to detect LAN IP for convenience (may not work on all systems)
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -n "$LAN_IP" ]; then
    echo "   LAN access: http://$LAN_IP:$FRONTEND_PORT"
fi

# Pass backend port to Next.js for proxy mode (next.config.mjs and server.mjs)
export BACKEND_PORT=$BACKEND_PORT
export PORT=$FRONTEND_PORT
# 使用自定义服务器启动前端（支持 WebSocket 代理）
node server.mjs > frontend_output.log 2>&1 &
FRONTEND_PID=$!
echo "FRONTEND_PID=$FRONTEND_PID" >> "$STATE_FILE"

if [ "$DAEMON_MODE" = true ]; then
    echo "📋 Frontend logs: web/frontend_output.log"
fi

# Trap Ctrl+C to kill both and cleanup
cleanup() {
    echo ""
    echo "🛑 正在关闭 MiniDock 开发服务..."
    
    # 从状态文件读取 PID（如果存在）
    local backend_pid=""
    local frontend_pid=""
    local tail_pid=""
    
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE"
        backend_pid="${BACKEND_PID:-}"
        frontend_pid="${FRONTEND_PID:-}"
        tail_pid="${TAIL_PID:-}"
    fi
    
    # 如果没有从状态文件获取到，使用全局变量
    backend_pid="${backend_pid:-${BACKEND_PID:-}}"
    frontend_pid="${frontend_pid:-${FRONTEND_PID:-}}"
    tail_pid="${tail_pid:-${TAIL_PID:-}}"
    
    # 终止日志监控进程及其所有子进程（包括管道中的 while 循环）
    if [ -n "$tail_pid" ] && ps -p "$tail_pid" > /dev/null 2>&1; then
        echo "   - 终止日志监控进程 (PID: $tail_pid)..."
        # 先终止所有子进程（包括管道中的 while 循环）
        pkill -TERM -P "$tail_pid" 2>/dev/null || true
        kill -TERM "$tail_pid" 2>/dev/null || true
        sleep 0.2
        # 强制终止
        pkill -KILL -P "$tail_pid" 2>/dev/null || true
        kill -KILL "$tail_pid" 2>/dev/null || true
    fi
    
    # 额外检查：清理可能残留的 tail 进程（防止跨 session 问题）
    local tail_pids=$(pgrep -f "tail.*backend_output.log" 2>/dev/null || true)
    if [ -n "$tail_pids" ]; then
        for pid in $tail_pids; do
            local cwd=$(get_process_cwd $pid)
            if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
                echo "   - 清理残留日志监控进程 (PID: $pid)..."
                pkill -KILL -P "$pid" 2>/dev/null || true
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    # 终止后端进程及其所有子进程
    if [ -n "$backend_pid" ] && ps -p "$backend_pid" > /dev/null 2>&1; then
        echo "   - 终止后端服务 (PID: $backend_pid)..."
        # 先尝试优雅终止
        kill -TERM "$backend_pid" 2>/dev/null || true
        # 终止所有子进程
        pkill -TERM -P "$backend_pid" 2>/dev/null || true
        sleep 0.5
        # 如果还在运行，强制终止
        if ps -p "$backend_pid" > /dev/null 2>&1; then
            pkill -KILL -P "$backend_pid" 2>/dev/null || true
            kill -KILL "$backend_pid" 2>/dev/null || true
        fi
    fi
    
    # 终止前端进程及其所有子进程
    if [ -n "$frontend_pid" ] && ps -p "$frontend_pid" > /dev/null 2>&1; then
        echo "   - 终止前端服务 (PID: $frontend_pid)..."
        # 先尝试优雅终止
        kill -TERM "$frontend_pid" 2>/dev/null || true
        # 终止所有子进程（npm 会启动 node 进程）
        pkill -TERM -P "$frontend_pid" 2>/dev/null || true
        sleep 0.5
        # 如果还在运行，强制终止
        if ps -p "$frontend_pid" > /dev/null 2>&1; then
            pkill -KILL -P "$frontend_pid" 2>/dev/null || true
            kill -KILL "$frontend_pid" 2>/dev/null || true
        fi
    fi
    
    # 额外检查：确保所有相关进程都被终止
    # 检查后端相关进程
    local backend_pids=$(pgrep -f "App.*serve|swift.*run.*App.*serve" 2>/dev/null || true)
    if [ -n "$backend_pids" ]; then
        for pid in $backend_pids; do
            local cwd=$(get_process_cwd $pid)
            if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
                echo "   - 清理残留后端进程 (PID: $pid)..."
                pkill -KILL -P "$pid" 2>/dev/null || true
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    # 检查前端相关进程
    local frontend_pids=$(pgrep -f "next.*dev|npm.*run.*dev" 2>/dev/null || true)
    if [ -n "$frontend_pids" ]; then
        for pid in $frontend_pids; do
            local cwd=$(get_process_cwd $pid)
            if [[ "$cwd" == "$PROJECT_ROOT/web" ]] || [[ "$cwd" == "$PROJECT_ROOT/web/"* ]]; then
                echo "   - 清理残留前端进程 (PID: $pid)..."
                pkill -KILL -P "$pid" 2>/dev/null || true
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    # 清理状态文件
    rm -f "$STATE_FILE"
    
    # 清理 .env.local
    if [ -f "$PROJECT_ROOT/web/.env.local" ]; then
        echo "   - 移除 web/.env.local..."
        rm -f "$PROJECT_ROOT/web/.env.local"
    fi
    
    echo "✅ 所有服务已关闭"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 在后台模式下，输出启动信息后退出
if [ "$DAEMON_MODE" = true ]; then
    echo ""
    echo "✅ MiniDock 服务已在后台启动"
    echo ""
    echo "📋 日志文件:"
    echo "   - 后端:  backend/backend_output.log"
    echo "   - 前端:  web/frontend_output.log"
    echo ""
    echo "🔍 查看服务状态: ./dev.sh status"
    echo "📋 查看日志: ./dev.sh logs"
    echo "📋 实时跟踪日志: ./dev.sh logs --tail"
    echo "🛑 停止服务: ./stop.sh"
    echo ""
    exit 0
fi

wait

