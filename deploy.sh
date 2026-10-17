#!/bin/bash
# deploy.sh — /game/ 아래로 게임들을 배포한다.
#
#   workspace/games/index.html            ← 이 레포 hub/index.html
#   workspace/games/land-grab/index.html  ← 이 레포 land-grab/index.html
#   workspace/games/fps/index.html        ← fps-prototype 레포 index.html
#   workspace/games/br/index.html         ← battle-royale 레포 br/index.html
#
# fps-prototype·battle-royale은 별도 레포다. 여기서 받아다 복사만 한다 (24 문서 참조).
# Flask는 games/ 아래 폴더를 그대로 서빙하므로 app.py는 안 고쳐도 된다 → 재기동 불필요.
set -e
REPO=$(cd "$(dirname "$0")" && pwd)
GAMES=/home/jh-happy/.openclaw-mir/workspace/games
FPS_SRC=${FPS_SRC:-/tmp/fps-prototype-deploy}
BR_SRC=${BR_SRC:-/tmp/battle-royale-deploy}

mkdir -p "$GAMES/land-grab" "$GAMES/fps" "$GAMES/br"

# 1) 허브와 땅따먹기 — 이 레포에서
cp "$REPO/hub/index.html"       "$GAMES/index.html"
cp "$REPO/land-grab/index.html" "$GAMES/land-grab/index.html"

# 2) FPS — 별도 레포에서 받아온다
if [ -d "$FPS_SRC/.git" ]; then
  git -C "$FPS_SRC" fetch --quiet origin || true
  # 로컬에 아직 안 올라간 커밋이 있으면 origin으로 되돌리지 않는다.
  # 그냥 reset 하면 푸시 못 한 작업이 조용히 사라진 채 옛 버전이 배포된다.
  FPS_REF=$(git -C "$FPS_SRC" rev-parse --verify --quiet origin/HEAD >/dev/null 2>&1 && echo origin/HEAD || echo origin/main)
  AHEAD=$(git -C "$FPS_SRC" rev-list --count "$FPS_REF"..HEAD 2>/dev/null || echo 0)
  if [ "${AHEAD:-0}" -gt 0 ]; then
    echo "  ⚠ fps 원본에 아직 안 올라간 커밋이 ${AHEAD}개 있다 — origin 대신 로컬 것을 배포한다"
    echo "     (푸시가 되면 이 경고는 사라진다)"
  else
    git -C "$FPS_SRC" reset --hard --quiet "$FPS_REF"
  fi
else
  rm -rf "$FPS_SRC"
  gh repo clone jh82130351/fps-prototype "$FPS_SRC" -- --quiet
fi
cp "$FPS_SRC/index.html" "$GAMES/fps/index.html"

# 3) 배틀로얄 — 별도 레포에서 (fps와 같은 방식)
if [ -d "$BR_SRC/.git" ]; then
  git -C "$BR_SRC" fetch --quiet origin || true
  # origin/HEAD 는 clone 한 레포에만 자동으로 생긴다. git init 으로 만든 레포에는 없어서
  # 그대로 쓰면 set -e 에 걸려 배포가 통째로 죽는다 — 없으면 origin/main 으로 떨어진다.
  BR_REF=$(git -C "$BR_SRC" rev-parse --verify --quiet origin/HEAD >/dev/null 2>&1 && echo origin/HEAD || echo origin/main)
  BR_AHEAD=$(git -C "$BR_SRC" rev-list --count "$BR_REF"..HEAD 2>/dev/null || echo 0)
  if [ "${BR_AHEAD:-0}" -gt 0 ]; then
    echo "  ⚠ br 원본에 아직 안 올라간 커밋이 ${BR_AHEAD}개 있다 — origin 대신 로컬 것을 배포한다"
    echo "     (푸시가 되면 이 경고는 사라진다)"
  else
    git -C "$BR_SRC" reset --hard --quiet "$BR_REF"
  fi
else
  rm -rf "$BR_SRC"
  gh repo clone jh82130351/battle-royale "$BR_SRC" -- --quiet
fi
cp "$BR_SRC/br/index.html" "$GAMES/br/index.html"

echo "배포 완료"
for f in "$GAMES/index.html" "$GAMES/land-grab/index.html" "$GAMES/fps/index.html" "$GAMES/br/index.html"; do
  printf '  %-58s %8d bytes\n' "$f" "$(stat -c%s "$f")"
done
echo "  fps 원본 커밋: $(git -C "$FPS_SRC" rev-parse --short HEAD)$([ "${AHEAD:-0}" -gt 0 ] && echo ' (미푸시)')"
echo "  br  원본 커밋: $(git -C "$BR_SRC" rev-parse --short HEAD)$([ "${BR_AHEAD:-0}" -gt 0 ] && echo ' (미푸시)')"
