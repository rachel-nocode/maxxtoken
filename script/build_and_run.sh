#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/desktop"
APP_PATTERN="$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ."
LOG_FILE="${TMPDIR:-/tmp}/maxxtoken-menubar.log"

stop_app() {
  pkill -f "$APP_PATTERN" >/dev/null 2>&1 || true
}

ensure_deps() {
  if [ ! -d "$APP_DIR/node_modules/electron" ]; then
    (cd "$APP_DIR" && npm install)
  fi
}

run_app() {
  cd "$APP_DIR"
  npm start
}

launch_background() {
  cd "$APP_DIR"
  npm start >"$LOG_FILE" 2>&1 &
}

case "$MODE" in
  run)
    stop_app
    ensure_deps
    run_app
    ;;
  --debug|debug)
    stop_app
    ensure_deps
    cd "$APP_DIR"
    ELECTRON_ENABLE_LOGGING=1 ELECTRON_ENABLE_STACK_DUMPING=1 npm start
    ;;
  --logs|logs)
    stop_app
    ensure_deps
    : >"$LOG_FILE"
    launch_background
    tail -f "$LOG_FILE"
    ;;
  --telemetry|telemetry)
    stop_app
    ensure_deps
    : >"$LOG_FILE"
    launch_background
    /usr/bin/log stream --info --style compact --predicate 'process CONTAINS "Electron"'
    ;;
  --verify|verify)
    stop_app
    ensure_deps
    : >"$LOG_FILE"
    launch_background
    sleep 2
    pgrep -f "$APP_PATTERN" >/dev/null
    stop_app
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
