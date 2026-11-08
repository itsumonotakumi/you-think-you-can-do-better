#!/usr/bin/env bash
# 使い方: tools/dev/run-agent.sh <task-name> <prompt-file> [model]
# git worktree を作り、OpenCode を非対話で実行してログを残す。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="${1:-}"
# NAME は作業フォルダ名とブランチ名に使う。パス脱出やシェル注入を拒否する
if ! [[ "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] || [[ "$NAME" == *..* ]]; then
  echo "NAME は英数字と . _ - だけで指定する（.. は不可）: ${NAME}" >&2
  exit 2
fi

# MODEL は自前のプロバイダだけ許可する（-で始まる値などオプション注入を防ぐ）
MODEL="${3:-opencode-go/deepseek-v4.1-flash}"
if ! [[ "$MODEL" =~ ^opencode-go/[A-Za-z0-9._#-]+$ ]]; then
  echo "MODEL は opencode-go/ で始まるものだけ指定できる: ${MODEL}" >&2
  exit 2
fi

# プロンプトはリポジトリの .worktrees/_prompts/ の下だけ許可する（任意のファイルを外部モデルへ送らせない）
PROMPTS_DIR="$ROOT/.worktrees/_prompts"
PROMPT_ARG="${2:-}"
case "$PROMPT_ARG" in
  ''|-*)
    echo "PROMPT_FILE は .worktrees/_prompts/ の下だけ指定できる: ${PROMPT_ARG}" >&2
    exit 2
    ;;
esac
PROMPT_DIR="$(cd "$(dirname "$PROMPT_ARG")" 2>/dev/null && pwd -P)" || {
  echo "PROMPT_FILE のフォルダがない: ${PROMPT_ARG}" >&2
  exit 2
}
PROMPT_FILE="$PROMPT_DIR/$(basename "$PROMPT_ARG")"
REAL_PROMPTS="$(cd "$PROMPTS_DIR" 2>/dev/null && pwd -P)" || REAL_PROMPTS=""
if [ -z "$REAL_PROMPTS" ] || [[ "$PROMPT_FILE" != "$REAL_PROMPTS"/* ]]; then
  echo "PROMPT_FILE は .worktrees/_prompts/ の下だけ指定できる: ${PROMPT_ARG}" >&2
  exit 2
fi
if [ ! -f "$PROMPT_FILE" ]; then
  echo "PROMPT_FILE がない: ${PROMPT_ARG}" >&2
  exit 2
fi

WT="$ROOT/.worktrees/$NAME"; BR="agent/$NAME"
LOG_DIR="$ROOT/.worktrees/_logs"; mkdir -p "$LOG_DIR"
if [ ! -d "$WT" ]; then
  git -C "$ROOT" worktree add -q -b "$BR" "$WT" main
fi
[ -e "$WT/node_modules" ] || ln -s "$ROOT/node_modules" "$WT/node_modules"
cd "$WT"
opencode run -m "$MODEL" "$(cat "$PROMPT_FILE")" > "$LOG_DIR/$NAME.log" 2>&1 || echo "EXIT $?" >> "$LOG_DIR/$NAME.log"
# コミット対象は作業フォルダだけ（.env などの未追跡ファイルを巻き込まない）
for path in src tests tools docs scenarios references locales audio .github \
  package.json package-lock.json index.html README.md tsconfig.json vite.config.ts \
  svelte.config.js playwright.config.ts HANDOFF.md; do
  [ -e "$path" ] && git add -A -- "$path" || true
done
git commit -qm "agent($NAME): work" >/dev/null 2>&1 || true
echo "done $NAME"
