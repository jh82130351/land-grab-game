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
  git -C "$FPS_SRC" fetch --quiet origin && git -C "$FPS_SRC" reset --hard --quiet origin/HEAD
else
  rm -rf "$FPS_SRC"
  gh repo clone jh82130351/fps-prototype "$FPS_SRC" -- --quiet
fi
cp "$FPS_SRC/index.html" "$GAMES/fps/index.html"

echo "배포 완료"
for f in "$GAMES/index.html" "$GAMES/land-grab/index.html" "$GAMES/fps/index.html"; do
  printf '  %-58s %8d bytes\n' "$f" "$(stat -c%s "$f")"
done
echo "  fps 원본 커밋: $(git -C "$FPS_SRC" rev-parse --short HEAD)"
