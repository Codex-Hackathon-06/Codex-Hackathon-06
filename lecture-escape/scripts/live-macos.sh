#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

bash "$SCRIPT_DIR/build-macos-audio.sh" >/dev/null

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  CODEX_NODE="/Users/${USER}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ ! -x "$CODEX_NODE" ]]; then
    echo "Node.js 20 이상을 찾지 못했습니다. Node.js를 설치한 뒤 다시 실행하세요." >&2
    exit 69
  fi
  NODE_BIN="$CODEX_NODE"
fi

cd "$PROJECT_DIR"
exec "$NODE_BIN" src/live-server.mjs "$@"
