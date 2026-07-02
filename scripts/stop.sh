#!/usr/bin/env bash
# Gracefully stops whatever `make start` started, using the PIDs saved in
# .run/*.pid — works from a different terminal/session than the one that
# started things, since it doesn't depend on shell job control.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

stop_one() {
  local name="$1" pidfile="$2"
  if [ ! -f "$pidfile" ]; then
    echo "$name: not running (no pid file)"
    return
  fi
  local pid
  pid="$(cat "$pidfile")"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$name: not running (stale pid file, removing)"
    rm -f "$pidfile"
    return
  fi

  echo "$name: stopping (pid $pid)…"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "$name: didn't exit gracefully, forcing"
    pkill -9 -P "$pid" 2>/dev/null || true
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pidfile"
  echo "$name: stopped"
}

stop_one "Backend"  "$RUN_DIR/backend.pid"
stop_one "Frontend" "$RUN_DIR/frontend.pid"
