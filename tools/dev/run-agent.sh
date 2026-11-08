#!/usr/bin/env bash
# 使い方: tools/dev/run-agent.sh <task-name> <prompt-file> [model]
# git worktree を作り、OpenCode を非対話で実行してログを残す。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="$1"; PROMPT_FILE="$2"; MODEL="${3:-opencode-go/deepseek-v4.1-flash}"
WT="$ROOT/.worktrees/$NAME"; BR="agent/$NAME"
LOG_DIR="$ROOT/.worktrees/_logs"; mkdir -p "$LOG_DIR"
if [ ! -d "$WT" ]; then
  git -C "$ROOT" worktree add -q -b "$BR" "$WT" main
fi
[ -e "$WT/node_modules" ] || ln -s "$ROOT/node_modules" "$WT/node_modules"
cd "$WT"
opencode run -m "$MODEL" "$(cat "$PROMPT_FILE")" > "$LOG_DIR/$NAME.log" 2>&1 || echo "EXIT $?" >> "$LOG_DIR/$NAME.log"
git add -A -- . ':!node_modules' >/dev/null 2>&1 || true
git commit -qm "agent($NAME): work" >/dev/null 2>&1 || true
echo "done $NAME"
