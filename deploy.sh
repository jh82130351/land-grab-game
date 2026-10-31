#!/bin/bash
# deploy.sh — /game/ 아래로 게임들을 배포한다.
#
#   workspace/games/index.html            ← 이 레포 hub/index.html
#   workspace/games/land-grab/index.html  ← 이 레포 land-grab/index.html
#   workspace/games/voxelcraft/index.html ← 이 레포 voxelcraft/index.html
#   workspace/games/lastdrop/{index.html,game.js} ← 이 레포 lastdrop/ (파일이 둘이다)
#   workspace/games/fps/index.html        ← fps-prototype 레포 index.html
#   workspace/games/br/index.html         ← battle-royale 레포 br/index.html
#
#   valuetopic/game_accounts.py           ← 이 레포 server/game_accounts.py (게임 계정 API, 28 문서)
#
# fps-prototype·battle-royale은 별도 레포다. 여기서 받아다 복사만 한다 (24 문서 참조).
# Flask는 games/ 아래 폴더를 그대로 서빙하므로 게임 파일은 재기동 불필요.
# 단 game_accounts.py 는 app.py 가 import 하는 파이썬 모듈이라, 바뀌었으면 Flask 재기동이 필요하다(아래에서 알려 준다).
# 계정 DB 는 valuetopic/data/game_accounts/ 에 있다 — games/ 아래에 두면 /game/ 으로 내려받힌다. 절대 옮기지 말 것.
set -e
REPO=$(cd "$(dirname "$0")" && pwd)
GAMES=/home/jh-happy/.openclaw-mir/workspace/games
FPS_SRC=${FPS_SRC:-/tmp/fps-prototype-deploy}
BR_SRC=${BR_SRC:-/tmp/battle-royale-deploy}

mkdir -p "$GAMES/land-grab" "$GAMES/fps" "$GAMES/br" "$GAMES/voxelcraft" "$GAMES/lastdrop"

# 1) 허브·땅따먹기·복셀크래프트 — 이 레포에서
cp "$REPO/hub/index.html"        "$GAMES/index.html"
cp "$REPO/land-grab/index.html"  "$GAMES/land-grab/index.html"
cp "$REPO/voxelcraft/index.html" "$GAMES/voxelcraft/index.html"
# 라스트 드롭만 파일이 둘이다. Flask 의 /game/<path:fn> 이 game.js 도 그대로 서빙한다.
cp "$REPO/lastdrop/index.html"   "$GAMES/lastdrop/index.html"
cp "$REPO/lastdrop/game.js"      "$GAMES/lastdrop/game.js"
# game.js 는 4시간 캐시(max-age=14400)라, 배포한 index.html 이 내용 해시로 game.js?v=… 를 부르게 한다 (07-b — 옛 game.js 가 남던 것)
LD_V=$(md5sum "$REPO/lastdrop/game.js" | cut -c1-10)
sed -i "s|src=\"game.js[^\"]*\"|src=\"game.js?v=$LD_V\"|" "$GAMES/lastdrop/index.html"
grep -q "game.js?v=$LD_V" "$GAMES/lastdrop/index.html" || { echo "lastdrop index.html 에 game.js 버전을 못 넣었다"; exit 1; }

# 1-b) 게임 계정 API 모듈 — valuetopic/ 옆으로. 내용이 바뀌었을 때만 복사하고 재기동 안내
VT=/home/jh-happy/.openclaw-mir/workspace/valuetopic
if ! cmp -s "$REPO/server/game_accounts.py" "$VT/game_accounts.py"; then
  python3 -m py_compile "$REPO/server/game_accounts.py"
  cp "$REPO/server/game_accounts.py" "$VT/game_accounts.py"
  echo "game_accounts.py 갱신 — Flask 재기동 필요: $VT/flask_server_off.sh && $VT/flask_server_on.sh"
fi

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
for f in "$GAMES/index.html" "$GAMES/land-grab/index.html" "$GAMES/voxelcraft/index.html" \
         "$GAMES/lastdrop/index.html" "$GAMES/lastdrop/game.js" \
         "$GAMES/fps/index.html" "$GAMES/br/index.html"; do
  printf '  %-58s %8d bytes\n' "$f" "$(stat -c%s "$f")"
done
echo "  fps 원본 커밋: $(git -C "$FPS_SRC" rev-parse --short HEAD)$([ "${AHEAD:-0}" -gt 0 ] && echo ' (미푸시)')"
echo "  br  원본 커밋: $(git -C "$BR_SRC" rev-parse --short HEAD)$([ "${BR_AHEAD:-0}" -gt 0 ] && echo ' (미푸시)')"
