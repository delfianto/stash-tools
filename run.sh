#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  dev     Start API (bun --watch) + Vite dev server in parallel
  prod    Build UI then start the Bun server (production)
  build   Build UI only (outputs to static/)
  api     Start API server only (bun --watch)
EOF
  exit 1
}

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}

case "${1:-}" in

  dev)
    trap cleanup EXIT INT TERM
    echo "→ Starting API (port 8000) + Vite dev server (port 5173)…"
    cd "$ROOT" && bun --watch server/index.ts &
    cd "$ROOT" && bun run dev:ui &
    wait
    ;;

  build)
    echo "→ Building UI…"
    cd "$ROOT" && bun run build
    echo "✓ Built to static/"
    ;;

  prod)
    echo "→ Building UI…"
    cd "$ROOT" && bun run build
    echo "→ Starting production server (port 8000)…"
    exec bun "$ROOT/server/index.ts"
    ;;

  api)
    exec bun --watch "$ROOT/server/index.ts"
    ;;

  *)
    usage
    ;;
esac
