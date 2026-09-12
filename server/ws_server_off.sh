#!/bin/bash
# ws_server_off.sh — 땅따먹기 WS 서버(5002) 종료
DIR=$(cd "$(dirname "$0")" && pwd)
PID_FILE=$DIR/ws_server.pid
if [ ! -f "$PID_FILE" ]; then echo "PID 파일 없음 — 이미 종료됨"; exit 0; fi
PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID"
  for i in $(seq 1 10); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$PID" 2>/dev/null && kill -KILL "$PID" 2>/dev/null
  echo "종료 (PID $PID)"
else
  echo "프로세스 없음 — PID 파일만 정리"
fi
rm -f "$PID_FILE"
