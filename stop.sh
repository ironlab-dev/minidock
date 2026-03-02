#!/bin/bash
# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Usage: ./stop.sh [--all]"
    echo ""
    echo "Description:"
    echo "  Stops MiniDock services (Backend & Frontend)."
    echo "  By default, it only stops processes running from this directory."
    echo ""
    echo "Options:"
    echo "  --all    Stop ALL MiniDock processes on this machine, regardless of directory."
    echo ""
    exit 0
fi

STOP_ALL=false
if [[ "$1" == "--all" ]]; then
    STOP_ALL=true
    echo "🛑 Stopping ALL MiniDock instances on this machine..."
else
    echo "🛑 Stopping MiniDock instances in $PROJECT_ROOT..."
fi

# Function to find and kill processes
kill_minidock_procs() {
    local pattern=$1
    local name=$2
    
    # Find PIDs
    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    
    if [ -z "$pids" ]; then
        return
    fi

    for pid in $pids; do
        local should_kill=false
        if [ "$STOP_ALL" = true ]; then
            should_kill=true
        else
            # Check if process is associated with this directory
            # 1. Check command line args first (faster, single ps call)
            local cmd_args=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            
            # If ps failed, process doesn't exist, skip
            if [ -z "$cmd_args" ]; then
                continue
            fi
            
            # Match if args contain "$PROJECT_ROOT/" (subdirectory) or "$PROJECT_ROOT " (argument) or end with "$PROJECT_ROOT"
            if [[ "$cmd_args" == *"$PROJECT_ROOT/"* ]] || [[ "$cmd_args" == *"$PROJECT_ROOT "* ]] || [[ "$cmd_args" == *"$PROJECT_ROOT" ]]; then
                should_kill=true
            else
                # 2. Only check current working directory if command line didn't match (lsof is slower)
                # Get the full CWD path
                local cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
                
                # If lsof failed, try alternative method
                if [ -z "$cwd" ]; then
                    cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
                fi
                
                # Check if cwd is exactly PROJECT_ROOT or a subdirectory
                if [[ "$cwd" == "$PROJECT_ROOT" ]] || [[ "$cwd" == "$PROJECT_ROOT/"* ]]; then
                    should_kill=true
                fi
            fi
        fi

        if [ "$should_kill" = true ]; then
            echo "   - Killing $name (PID: $pid)..."
            # Kill the process and its children
            pkill -9 -P $pid 2>/dev/null || true
            kill -9 $pid 2>/dev/null || true
        fi
    done
}

# 0. Kill known PIDs from .dev_state (Local mode optimization)
if [ "$STOP_ALL" = false ] && [ -f "$PROJECT_ROOT/.dev_state" ]; then
    source "$PROJECT_ROOT/.dev_state"
    if [ -n "$BACKEND_PID" ]; then
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
             echo "   - Killing Backend from state (PID: $BACKEND_PID)..."
             pkill -9 -P $BACKEND_PID 2>/dev/null || true
             kill -9 $BACKEND_PID 2>/dev/null || true
        fi
    fi
    if [ -n "$FRONTEND_PID" ]; then
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
             echo "   - Killing Frontend from state (PID: $FRONTEND_PID)..."
             pkill -9 -P $FRONTEND_PID 2>/dev/null || true
             kill -9 $FRONTEND_PID 2>/dev/null || true
        fi
    fi
    if [ -n "$TAIL_PID" ]; then
        if ps -p $TAIL_PID > /dev/null 2>&1; then
             echo "   - Killing log monitor (tail) from state (PID: $TAIL_PID)..."
             # Kill all child processes (including the while loop in the pipe)
             pkill -9 -P $TAIL_PID 2>/dev/null || true
             kill -9 $TAIL_PID 2>/dev/null || true
        fi
    fi
fi

# Collect project directories before killing processes (for --all mode)
PROJECT_DIRS_TO_CLEAN=""
if [ "$STOP_ALL" = true ]; then
    # Collect working directories from processes we're about to kill
    for pattern in "App serve" "node.*server\.mjs" "next dev" "next start" "swift run App"; do
        pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            for pid in $pids; do
                # Get working directory from process before killing it
                cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || true)
                if [ -n "$cwd" ] && [ -f "$cwd/.dev_state" ]; then
                    # Avoid duplicates
                    if [[ ! "$PROJECT_DIRS_TO_CLEAN" =~ "$cwd" ]]; then
                        PROJECT_DIRS_TO_CLEAN="$PROJECT_DIRS_TO_CLEAN $cwd"
                    fi
                fi
            done
        fi
    done
    # Also check npm processes
    pids=$(pgrep -f "npm" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            if [[ "$cmd" == *"dev"* ]] || [[ "$cmd" == *"start"* ]]; then
                cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || true)
                if [ -n "$cwd" ] && [ -f "$cwd/.dev_state" ]; then
                    if [[ ! "$PROJECT_DIRS_TO_CLEAN" =~ "$cwd" ]]; then
                        PROJECT_DIRS_TO_CLEAN="$PROJECT_DIRS_TO_CLEAN $cwd"
                    fi
                fi
            fi
        done
    fi
fi

# 1. Kill Backend (Vapor App) - Multiple patterns
if [ "$STOP_ALL" = true ]; then
    # In --all mode, kill ALL processes matching these patterns regardless of directory
    echo "🔍 Searching for ALL Backend processes..."
    # Find all processes - we'll filter more carefully
    # First, try to find processes with "App serve" pattern more specifically
    all_pids=$(pgrep -f "App.*serve|serve.*App" 2>/dev/null || true)
    if [ -n "$all_pids" ]; then
        for pid in $all_pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            # More precise matching: must have "App" and "serve", and be in a backend directory or have backend/minidock in path
            # Exclude system apps like Cursor Helper, Lark Helper, etc.
            if [[ "$cmd" == *"App"* ]] && [[ "$cmd" == *"serve"* ]]; then
                # Exclude if it's a system helper app
                if [[ "$cmd" == *"Helper"* ]] || [[ "$cmd" == *".app/Contents"* ]] || [[ "$cmd" == *"/Applications/"* ]]; then
                    continue
                fi
                # Check if it's in a backend directory or has minidock in the path
                if [[ "$cwd" == *"/minidock"*"/backend"* ]] || [[ "$cwd" == *"/minidock"*"/backend" ]] || \
                   [[ "$cmd" == *"/minidock"*"/backend"* ]] || [[ "$cmd" == *"/minidock"*"/backend" ]] || \
                   [[ "$cmd" == *".build"*"App"* ]] || [[ "$cmd" == *"/backend"*"App"* ]]; then
                    echo "   - Killing Backend (PID: $pid): $(echo $cmd | cut -c1-80)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
    fi
    # Also check for swift run processes
    pids=$(pgrep -f "swift.*run.*App" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            # Check if it's in a minidock directory
            if [[ "$cwd" == *"/minidock"* ]] || [[ "$cwd" == *"/backend"* ]]; then
                echo "   - Killing Backend (swift run) (PID: $pid)..."
                pkill -9 -P $pid 2>/dev/null || true
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
else
    # In normal mode, use the directory-aware function
    # Try multiple patterns to catch all possible backend process variations
    kill_minidock_procs "App serve" "Backend (App serve)"
    kill_minidock_procs "swift run App serve" "Backend (swift run)"
    kill_minidock_procs "swift.*run.*App" "Backend (swift run App)"
    
    # Additional check: find all processes in backend directory that might be backend-related
    # This catches edge cases where pattern matching might fail
    # Only run this if we haven't already killed processes (optimization: avoid duplicate work)
    backend_pids=$(pgrep -f "App|swift.*run" 2>/dev/null || true)
    if [ -n "$backend_pids" ]; then
        for pid in $backend_pids; do
            # Get command line args first (single ps call, faster)
            cmd_args=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            
            # If ps failed, process doesn't exist, skip
            if [ -z "$cmd_args" ]; then
                continue
            fi
            
            # Quick check: must contain App and serve/run
            if [[ "$cmd_args" != *"App"* ]] || ([[ "$cmd_args" != *"serve"* ]] && [[ "$cmd_args" != *"run"* ]]); then
                continue
            fi
            
            # Only check working directory if command line matches (lsof is slower)
            cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
            if [ -z "$cwd" ]; then
                cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            fi
            
            # Check if it's in the project backend directory
            if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
                echo "   - Killing Backend (directory match) (PID: $pid)..."
                pkill -9 -P $pid 2>/dev/null || true
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
    
    # Clean up any residual tail processes monitoring backend logs
    tail_pids=$(pgrep -f "tail.*backend_output.log" 2>/dev/null || true)
    if [ -n "$tail_pids" ]; then
        for pid in $tail_pids; do
            cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
            if [ -z "$cwd" ]; then
                cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            fi
            # Check if it's in the project backend directory
            if [[ "$cwd" == "$PROJECT_ROOT/backend" ]] || [[ "$cwd" == "$PROJECT_ROOT/backend/"* ]]; then
                echo "   - Cleaning up residual log monitor (tail) (PID: $pid)..."
                pkill -9 -P $pid 2>/dev/null || true
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
fi

# 2. Kill Frontend (Next.js) - Multiple patterns
if [ "$STOP_ALL" = true ]; then
    # In --all mode, kill ALL processes matching these patterns regardless of directory
    echo "🔍 Searching for ALL Frontend processes..."
    # Find all processes with "next" in command line
    all_pids=$(pgrep -f "next" 2>/dev/null || true)
    if [ -n "$all_pids" ]; then
        for pid in $all_pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            # Check if it's a next process in a minidock web directory
            if [[ "$cmd" == *"next"* ]] && ([[ "$cwd" == *"/minidock"*"/web"* ]] || [[ "$cmd" == *"/minidock"*"/web"* ]] || [[ "$cmd" == *"next-server"* ]]); then
                if [[ "$cmd" == *"dev"* ]] || [[ "$cmd" == *"start"* ]] || [[ "$cmd" == *"next-server"* ]]; then
                    echo "   - Killing Frontend (PID: $pid): $(echo $cmd | cut -c1-80)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
    fi
    # Kill npm processes that might be running dev/start in minidock web directories
    pids=$(pgrep -f "npm" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            if [[ "$cmd" == *"dev"* ]] || [[ "$cmd" == *"start"* ]]; then
                cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || true)
                # Check if it's in a minidock web directory
                if [[ "$cwd" == *"/minidock"*"/web"* ]] || [[ "$cwd" == *"/minidock"*"/web" ]]; then
                    echo "   - Killing Frontend (npm in minidock web dir) (PID: $pid)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
    fi
    # Kill node processes running next in minidock directories
    pids=$(pgrep -f "node.*next" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
            if [[ "$cwd" == *"/minidock"* ]]; then
                echo "   - Killing Frontend (node next in minidock) (PID: $pid)..."
                pkill -9 -P $pid 2>/dev/null || true
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
else
    # In normal mode, use comprehensive directory-aware search
    echo "🔍 Searching for Frontend processes in $PROJECT_ROOT..."
    
    # 1. Kill processes matching server.mjs, next dev, or next start patterns
    kill_minidock_procs "node.*server\.mjs" "Frontend (server.mjs)"
    kill_minidock_procs "next dev" "Frontend (next dev)"
    kill_minidock_procs "next start" "Frontend (next start)"
    
    # 2. Kill npm processes that are running dev/start in project web directory
    pids=$(pgrep -f "npm" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            if [[ "$cmd" == *"dev"* ]] || [[ "$cmd" == *"start"* ]]; then
                cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
                if [ -z "$cwd" ]; then
                    cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
                fi
                # Check if it's in the project web directory
                if [[ "$cwd" == "$PROJECT_ROOT/web" ]] || [[ "$cwd" == "$PROJECT_ROOT/web/"* ]]; then
                    echo "   - Killing Frontend (npm) (PID: $pid)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
    fi
    
    # 3. Kill node processes that are running next in project web directory
    # This catches node processes that might not have "next dev" in their command line
    pids=$(pgrep -f "node" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            # Check if it's a node process related to next (might be in node_modules/.bin/next or similar)
            if [[ "$cmd" == *"next"* ]] || [[ "$cmd" == *"next-server"* ]]; then
                cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
                if [ -z "$cwd" ]; then
                    cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
                fi
                # Check if it's in the project web directory or its subdirectories (strict match)
                if [[ "$cwd" == "$PROJECT_ROOT/web" ]] || [[ "$cwd" == "$PROJECT_ROOT/web/"* ]]; then
                    echo "   - Killing Frontend (node next) (PID: $pid)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                elif [[ "$cmd" == *"$PROJECT_ROOT/web/"* ]] || [[ "$cmd" == *"$PROJECT_ROOT/web "* ]] || [[ "$cmd" == *"$PROJECT_ROOT/web" ]]; then
                    # Also check command line for project web path
                    echo "   - Killing Frontend (node next) (PID: $pid)..."
                    pkill -9 -P $pid 2>/dev/null || true
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
        done
    fi
    
    # 4. Kill processes by port (only if we have state file with port info)
    # Only check port if we have a state file, to avoid killing other instances on default port
    if [ -f "$PROJECT_ROOT/.dev_state" ]; then
        source "$PROJECT_ROOT/.dev_state" 2>/dev/null || true
        FRONTEND_PORT="${FRONTEND_PORT:-}"
        
        if [ -n "$FRONTEND_PORT" ]; then
            port_pids=$(lsof -ti:$FRONTEND_PORT 2>/dev/null || true)
            if [ -n "$port_pids" ]; then
                for pid in $port_pids; do
                    if ps -p $pid > /dev/null 2>&1; then
                        cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
                        cwd=$(lsof -p $pid -a -d cwd -F n 2>/dev/null | grep '^n/' | cut -c2- || echo "")
                        if [ -z "$cwd" ]; then
                            cwd=$(lsof -p $pid 2>/dev/null | grep "cwd" | awk '{print $NF}' || echo "")
                        fi
                        # Only kill if it's in our project directory (strict match)
                        # Check if cwd is exactly PROJECT_ROOT or a subdirectory
                        if [[ "$cwd" == "$PROJECT_ROOT" ]] || [[ "$cwd" == "$PROJECT_ROOT/"* ]]; then
                            echo "   - Killing Frontend (port $FRONTEND_PORT) (PID: $pid)..."
                            pkill -9 -P $pid 2>/dev/null || true
                            kill -9 $pid 2>/dev/null || true
                        elif [[ "$cmd" == *"$PROJECT_ROOT/"* ]] || [[ "$cmd" == *"$PROJECT_ROOT "* ]] || [[ "$cmd" == *"$PROJECT_ROOT" ]]; then
                            # Also check command line for project path
                            echo "   - Killing Frontend (port $FRONTEND_PORT) (PID: $pid)..."
                            pkill -9 -P $pid 2>/dev/null || true
                            kill -9 $pid 2>/dev/null || true
                        fi
                    fi
                done
            fi
        fi
    fi
fi

# 3. Kill processes by port (--all mode only)
# Note: 端口分配规则：
# - 前端端口：23000（默认）或 23XXX（目录名包含数字）或 33000+（冲突时顺延）
# - 后端端口：前端端口 + 1000
# 在 --all 模式下，主要通过进程模式匹配来查找，这里只检查常见的默认端口
if [ "$STOP_ALL" = true ]; then
    echo "🔍 Checking for processes on MiniDock default ports (24000, 23000)..."
    for port in 24000 23000; do
        pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            for pid in $pids; do
                # Check if it's not already killed
                if ps -p $pid > /dev/null 2>&1; then
                    cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
                    # In --all mode, kill any process on these ports (they're minidock-specific)
                    # But be a bit conservative - check if it looks like our processes
                    if [[ "$cmd" == *"App"* ]] || [[ "$cmd" == *"next"* ]] || [[ "$cmd" == *"minidock"* ]] || [[ "$cmd" == *"MiniDock"* ]] || [[ "$cmd" == *"swift"* ]] || [[ "$cmd" == *"node"* ]] || [[ "$cmd" == *"npm"* ]]; then
                        echo "   - Killing process on port $port (PID: $pid)..."
                        pkill -9 -P $pid 2>/dev/null || true
                        kill -9 $pid 2>/dev/null || true
                    else
                        # Even if it doesn't match our patterns, if it's on our ports, warn and kill
                        echo "   - Warning: Unknown process on port $port (PID: $pid), killing anyway..."
                        pkill -9 -P $pid 2>/dev/null || true
                        kill -9 $pid 2>/dev/null || true
                    fi
                fi
            done
        fi
    done
fi

# 4. Kill MiniDock.app processes (--all mode only)
if [ "$STOP_ALL" = true ]; then
    echo "🔍 Checking for MiniDock.app processes..."
    # Find MiniDock.app processes by bundle identifier
    pids=$(pgrep -f "cc.ironlab.minidock" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            echo "   - Killing MiniDock.app process (bundle ID) (PID: $pid)..."
            kill -9 $pid 2>/dev/null || true
        done
    fi
    # Find by executable name - be more aggressive in --all mode
    pids=$(pgrep -f "MiniDock" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            cmd=$(ps -wwp $pid -o args 2>/dev/null | tail -n 1 || echo "")
            # In --all mode, kill any process with MiniDock in the name
            if [[ "$cmd" == *"MiniDock"* ]]; then
                echo "   - Killing MiniDock process (PID: $pid)..."
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
    # Also try to find by process name directly
    pids=$(pgrep -i "minidock" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            if ps -p $pid > /dev/null 2>&1; then
                echo "   - Killing MiniDock process (by name) (PID: $pid)..."
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
    
    # Kill tail log monitors
    echo "🔍 Cleaning up log monitors..."
    pids=$(pgrep -f "tail.*backend_output.log" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            echo "   - Killing log monitor (PID: $pid)..."
            kill -9 $pid 2>/dev/null || true
        done
    fi
fi

# 5. Cleanup state files
STATE_FILE="$PROJECT_ROOT/.dev_state"
if [ "$STOP_ALL" = true ]; then
    echo "🧹 Cleaning up state files..."
    # In --all mode, clean state files from directories we collected
    if [ -n "$PROJECT_DIRS_TO_CLEAN" ]; then
        for dir in $PROJECT_DIRS_TO_CLEAN; do
            if [ -f "$dir/.dev_state" ]; then
                echo "   - Removing $dir/.dev_state"
                rm -f "$dir/.dev_state" 2>/dev/null || true
                # Also clean up .env.local in web directory
                if [ -f "$dir/web/.env.local" ]; then
                    echo "   - Removing $dir/web/.env.local"
                    rm -f "$dir/web/.env.local" 2>/dev/null || true
                fi
            fi
        done
    fi
    # Also search for any other .dev_state files that might be minidock related
    # Search in common locations
    for search_dir in "$HOME/code" "$HOME/Projects" "$HOME/Development" "/Users/shared"; do
        if [ -d "$search_dir" ]; then
            find "$search_dir" -maxdepth 3 -name ".dev_state" -type f 2>/dev/null | while read state_file; do
                state_dir=$(dirname "$state_file")
                # Check if this directory contains minidock backend or web
                if [ -d "$state_dir/backend" ] && [ -d "$state_dir/web" ]; then
                    echo "   - Removing $state_file"
                    rm -f "$state_file" 2>/dev/null || true
                    # Also clean up .env.local in web directory
                    if [ -f "$state_dir/web/.env.local" ]; then
                        echo "   - Removing $state_dir/web/.env.local"
                        rm -f "$state_dir/web/.env.local" 2>/dev/null || true
                    fi
                fi
            done
        fi
    done
    # Also clean current directory's state file if it exists
    if [ -f "$STATE_FILE" ]; then
        rm -f "$STATE_FILE" 2>/dev/null || true
    fi
else
    # In default mode, only clean current directory's state file
    if [ -f "$STATE_FILE" ]; then
        echo "🧹 Cleaning up state files..."
        rm -f "$STATE_FILE"
        # Also clean up .env.local in web directory
        if [ -f "$PROJECT_ROOT/web/.env.local" ]; then
            echo "🧹 Cleaning up web/.env.local..."
            rm -f "$PROJECT_ROOT/web/.env.local"
        fi
    fi
fi

echo "✅ Done."
