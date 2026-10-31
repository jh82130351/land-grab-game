# 라스트 드롭 헤드리스 시험 (07-b)

배포되지 않는다 (`deploy.sh` 는 lastdrop/index.html · game.js 만 복사).

준비 — 레포를 정적 서버로, 헤드리스 크롬을 디버그 포트로:

```bash
python3 -m http.server 8761 --directory ~/land-grab-game &
google-chrome --headless=new --remote-debugging-port=9461 --user-data-dir=/tmp/ld-cdp about:blank &
U=http://127.0.0.1:8761/lastdrop/index.html
```

| 시험 | 명령 | 통과 기준 |
|---|---|---|
| 모든 건물 오르내리기 (나 걷기·달리기·비껴서 ±off, 봇) | `python3 run.py 9461 $U stairs.js '{"map":"meadow","off":0.3}'` (사막은 `"map":"desert"`) | `실패: []` |
| 참 꺾기 통과 폭 | `python3 run.py 9461 $U turn.js '{"map":"meadow"}'` | 통과폭 1.5m 이상 |
| 계단 머리 높이 | `python3 run.py 9461 $U headroom.js '{"map":"meadow"}'` | `머리막힘: 0` |
| 초원 20번 저택 수 | `python3 mansions.py 9461 $U 20` (보장 단계 시험: 뒤에 `1` 또는 `2`) | 3채 미만 0번 (종료 코드 0) |

`stairs.js` 에 `"skip":2` 를 주면 저택을 전부 강제 배치(3단계)로 만들어 시험한다.
