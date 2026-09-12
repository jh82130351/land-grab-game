#!/bin/bash
# ws_server_on.sh — 땅따먹기 WS 서버(5002) 멱등 기동
#  - 이미 5002가 떠 있으면 스킵
#  - PID 파일: server/ws_server.pid / 로그: server/logs/ws_server.log
DIR=$(cd "$(dirname "$0")" && pwd)
PID_FILE=$DIR/ws_server.pid
LOG_DIR=$DIR/logs
mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "이미 실행 중 (PID $(cat "$PID_FILE")) — 스킵"; exit 0
fi
rm -f "$PID_FILE"

if ss -tln 2>/dev/null | grep -q ':5002 '; then
  echo "5002 포트 이미 사용 중 — 스킵"; exit 0
fi

cd "$DIR" || exit 1
nohup python3 ws_server.py >> "$LOG_DIR/ws_server.out" 2>&1 &
echo $! > "$PID_FILE"
echo "기동 완료 (PID $(cat "$PID_FILE"), 127.0.0.1:5002)"
