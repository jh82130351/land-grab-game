#!/bin/bash
# install_autostart.sh — 재부팅 후 자동 기동 등록 (crontab @reboot)
#
# 등록 대상
#   1) 땅따먹기 WS 서버 (포트 5002)
#   2) Cloudflare Tunnel (valuetopic)
#   3) ValueTopic Flask (포트 5001)
# 모두 멱등 스크립트이거나 포트 점유를 확인하므로 중복 실행 위험은 없다.
#
# 사용:  server/install_autostart.sh          등록
#        server/install_autostart.sh --show   현재 crontab 확인
#        server/install_autostart.sh --remove 등록 해제

set -e
DIR=$(cd "$(dirname "$0")" && pwd)
WS_ON="$DIR/ws_server_on.sh"
FLASK_ON="/home/jh-happy/.openclaw-mir/workspace/valuetopic/flask_server_on.sh"
CF_CONF="/home/jh-happy/.cloudflared/config-valuetopic.yml"
CF_LOG="/home/jh-happy/.cloudflared/tunnel-valuetopic.log"
TAG="# land-grab-game autostart"

case "$1" in
  --show)   crontab -l 2>/dev/null || echo "(crontab 비어 있음)"; exit 0 ;;
  --remove) crontab -l 2>/dev/null | grep -v "$TAG" | crontab - ; echo "등록 해제 완료"; exit 0 ;;
esac

TMP=$(mktemp)
crontab -l 2>/dev/null | grep -v "$TAG" > "$TMP" || true
cat >> "$TMP" <<CRON
@reboot sleep 20 && $WS_ON $TAG
@reboot sleep 20 && $FLASK_ON $TAG
@reboot sleep 25 && nohup cloudflared tunnel --config $CF_CONF run valuetopic-tunnel >> $CF_LOG 2>&1 & $TAG
CRON
crontab "$TMP"
rm -f "$TMP"
echo "등록 완료 — 확인: crontab -l"
