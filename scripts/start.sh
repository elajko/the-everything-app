#!/usr/bin/env bash
# Starts the backend API and the frontend static server, both detached
# (nohup'd, backgrounded, disowned) so this script returns control to the
# terminal immediately. PIDs go to .run/*.pid so `make stop` (possibly from
# a different terminal entirely) knows what to shut down.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-5500}"

mkdir -p "$RUN_DIR"

is_running() {
  local pidfile="$1"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_backend() {
  local pidfile="$RUN_DIR/backend.pid"
  if is_running "$pidfile"; then
    echo "Backend already running (pid $(cat "$pidfile"))"
    return
  fi
  : >"$RUN_DIR/backend.log"
  (
    cd "$BACKEND_DIR"
    nohup node --watch src/server.js >>"$RUN_DIR/backend.log" 2>&1 &
    disown
    echo $! >"$pidfile"
  )
  echo "Backend starting (pid $(cat "$pidfile")) — logs: .run/backend.log"
}

start_frontend() {
  local pidfile="$RUN_DIR/frontend.pid"
  if is_running "$pidfile"; then
    echo "Frontend already running (pid $(cat "$pidfile"))"
    return
  fi
  : >"$RUN_DIR/frontend.log"
  (
    cd "$FRONTEND_DIR"
    nohup python3 -m http.server "$FRONTEND_PORT" >>"$RUN_DIR/frontend.log" 2>&1 &
    disown
    echo $! >"$pidfile"
  )
  echo "Frontend starting (pid $(cat "$pidfile")) — logs: .run/frontend.log"
}

start_backend
start_frontend

wait_healthy() {
  local url="$1" tries=15
  for _ in $(seq 1 "$tries"); do
    curl -fs "$url" >/dev/null 2>&1 && return 0
    sleep 0.3
  done
  return 1
}

if wait_healthy "http://localhost:$BACKEND_PORT/api/health"; then
  echo "Backend healthy:  http://localhost:$BACKEND_PORT"
else
  echo "Backend not responding yet — check .run/backend.log" >&2
fi
if wait_healthy "http://localhost:$FRONTEND_PORT/"; then
  echo "Frontend healthy: http://localhost:$FRONTEND_PORT"
else
  echo "Frontend not responding yet — check .run/frontend.log" >&2
fi
echo "Run 'make stop' to shut down (works from any terminal)."
