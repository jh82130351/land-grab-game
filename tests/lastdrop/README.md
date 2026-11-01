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

## 총기 (lastdrop-08)

헤드리스 크롬은 한 번 돌릴 때마다 새로 띄운다 (같은 탭에서 연달아 돌리면 두 번째가 멈춘다).

| 시험 | 명령 | 통과 기준 |
|---|---|---|
| 총별 연사·탄창·재장전·피해·점사·쌍발·감속·줌·보급·스폰·모양·소리 | `python3 run.py 9461 $U guns.js '{"map":"meadow"}'` | 표 수치와 같다 · `헬멧3_머리` 대물 `죽음:true` · `바닥대물저격:0` · `소리_겹침:0` |
| 봇 — 총을 쥐여 나(무적)와 싸우기 | `python3 run.py 9461 $U botguns.js '{"map":"desert","guns":["burst","dbl","lmg","dmr"]}'` | 점사 묶음 3 · 쌍발 묶음 2 · 경기관총 거리 ≈32 · 지정사수 거리 > 다른 총 |
| 봇전 한 판 (나는 숨김, 자기장 ×0.6) | `python3 run.py 9461 $U botmatch.js '{"map":"meadow"}'` | `남은봇:1` · `오류:0` |

## 건물 안 끼임 (07-c)

| 시험 | 명령 | 통과 기준 |
|---|---|---|
| 계단 건물마다 안에서 무작위 이동·점프 30초 × 6명 (나 3 · 봇 3) | `python3 run.py 9461 $U indoor.js '{"map":"meadow","seed":1,"sec":30}'` (사막 `"desert"`) | `완전갇힘:0` · `벽속:0` · `관통:0` (맵 키가 틀리면 바로 알린다) |
| 머리 충돌 — 머리 위 0.1~1.0m 판 밑에서 점프 | `python3 run.py 9461 $U ceiling.js '{"map":"meadow"}'` | 모두 `판속프레임:0` · `판위프레임:0` |

## 산지 (lastdrop-10)

URL 에 `?seed=1001` 을 붙이면 같은 섬이 다시 만들어진다. 모든 산지 시험은 `MAP_ID === 'mountain'` 을 먼저 확인한다.

| 시험 | 명령 | 통과 기준 |
|---|---|---|
| 생성 — 시간 · 배치 · 산 높이 · 강 단면 · 다리 · 도로 연결 | `python3 run.py 9461 $U mtgen.js '{"map":"mountain"}'` | 5초 안 · `도로덩어리:1` · `err:[]` |
| 나 — 헤엄 횡단 · 수영 중 사격 · 머리만 · 다리 걷기/지프 · 미끄러짐 | `python3 run.py 9461 $U mtplay.js '{"map":"mountain"}'` | 수영 28~32초 · 다리 4개 모두 `건넘` · 오르막 0m |
| 봇 — 다리 4개 · 헤엄 건너기 | `python3 run.py 9461 $U botcross.js '{"map":"mountain"}'` | `도착:true` |
| 봇전 한 판 (자기장 그대로) | `python3 run.py 9461 $U botmatch.js '{"map":"mountain","speed":1,"norender":1,"cap":1100}'` | 12~15분 · `오류:0` |
| 성능 | `python3 run.py 9461 $U perf.js '{"map":"mountain"}'` | 맵끼리 비교 |

## 투척류 (lastdrop-09)

| 시험 | 명령 | 통과 기준 |
|---|---|---|
| 전리품·줍기·핫바 · 충전 거리 · 수류탄 · 섬광 · 봇 섬광/투척 · 수영 중 | `python3 run.py 9461 $U throws.js '{"map":"meadow"}'` (desert · mountain) | 수류탄 4초 · 120/60/1.5/0 · 벽 뒤 0 · 섬광 0m 10초 1.0 · 5m 5초 0.5 · 벽 뒤 0 |
| 실전 투척 (모든 봇 어려움) | `python3 run.py 9461 $U botmatch.js '{"map":"desert","tier":4}'` | `오류:0` · `투척.던짐 > 0` |
