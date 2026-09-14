#!/bin/bash
# deploy.sh — /game/ 아래로 게임들을 배포한다.
#
#   workspace/games/index.html            ← 이 레포 hub/index.html
#   workspace/games/land-grab/index.html  ← 이 레포 land-grab/index.html
#   workspace/games/fps/index.html        ← fps-prototype 레포 index.html
#
# fps-prototype은 별도 레포다. 여기서 받아다 복사만 한다 (24 문서 참조).
# Flask는 games/ 아래 폴더를 그대로 서빙하므로 app.py는 안 고쳐도 된다 → 재기동 불필요.
set -e
REPO=$(cd "$(dirname "$0")" && pwd)
GAMES=/home/jh-happy/.openclaw-mir/workspace/games
FPS_SRC=${FPS_SRC:-/tmp/fps-prototype-deploy}

mkdir -p "$GAMES/land-grab" "$GAMES/fps"

# 1) 허브와 땅따먹기 — 이 레포에서
cp "$REPO/hub/index.html"       "$GAMES/index.html"
cp "$REPO/land-grab/index.html" "$GAMES/land-grab/index.html"

# 2) FPS — 별도 레포에서 받아온다
if [ -d "$FPS_SRC/.git" ]; then
  git -C "$FPS_SRC" fetch --quiet origin || true
  # 로컬에 아직 안 올라간 커밋이 있으면 origin으로 되돌리지 않는다.
  # 그냥 reset 하면 푸시 못 한 작업이 조용히 사라진 채 옛 버전이 배포된다.
  AHEAD=$(git -C "$FPS_SRC" rev-list --count origin/HEAD..HEAD 2>/dev/null || echo 0)
  if [ "${AHEAD:-0}" -gt 0 ]; then
    echo "  ⚠ fps 원본에 아직 안 올라간 커밋이 ${AHEAD}개 있다 — origin 대신 로컬 것을 배포한다"
    echo "     (푸시가 되면 이 경고는 사라진다)"
  else
    git -C "$FPS_SRC" reset --hard --quiet origin/HEAD
  fi
else
  rm -rf "$FPS_SRC"
  gh repo clone jh82130351/fps-prototype "$FPS_SRC" -- --quiet
fi
cp "$FPS_SRC/index.html" "$GAMES/fps/index.html"

echo "배포 완료"
for f in "$GAMES/index.html" "$GAMES/land-grab/index.html" "$GAMES/fps/index.html"; do
  printf '  %-58s %8d bytes\n' "$f" "$(stat -c%s "$f")"
done
echo "  fps 원본 커밋: $(git -C "$FPS_SRC" rev-parse --short HEAD)$([ "${AHEAD:-0}" -gt 0 ] && echo ' (미푸시)')"
