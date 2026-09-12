# 08 - WS 서버 + 방 만들기/선택 (설정 포함, 입장까지)

## 무엇을 했나
- **Python WebSocket 서버(포트 5002)** 가 방 생성·목록·입장·퇴장·방장 위임·빈 방 정리를 처리한다.
- 방장이 **정원(2/3/4) · 제한시간(1/2/3/5분) · 승리 점령률(60%/없음)** 을 정해 방을 만든다.
- **Cloudflare Tunnel 경로 규칙**으로 `wss://valuetopic.com/game/ws` → 5002.
- 3D 로비가 실서버에 붙어 **방 목록을 실시간 표시**한다. placeholder는 없다.
- 게임 동기화는 다음 단계다. 대기실의 `게임 시작` 은 누르면 안내만 띄운다.

## ⚠️ 순단 여부
**이번 단계에서는 사이트 순단이 없었다.** ingress 규칙이 이전 작업에서 이미 적용돼 있어
`cloudflared` 재기동이 필요 없었다. 규칙 매칭을 실측으로 재확인만 했다.
```
https://valuetopic.com/game/ws → service: http://localhost:5002
```
WS 서버(5002)만 재기동했는데, 이건 게임 로비 전용이라 웹사이트에는 영향이 없다.
(터널 규칙을 처음 넣은 이전 작업에서는 재기동에 따른 순단이 있었다.)

---

## 서버 구조 — `server/ws_server.py`
역할은 둘이다. **방 관리**와 **중계**. 게임 계산은 하지 않는다.

### 방 데이터
```
{ id, name, host, members[], cap(2~4), secs(60~300), win(60|null), state, created }
state = 'wait'(정원 미달) | 'play'(정원 참)
```
- **클라이언트가 보낸 설정값을 그대로 믿지 않는다.** `pick()` 이 허용 목록에 있는 값만 통과시키고
  나머지는 기본값(2명·180초·없음)으로 떨어뜨린다. 이름은 20자로 자른다.
- 정원 초과 입장은 거부한다.
- **방장이 나가면 남은 사람에게 위임**하고 `host_changed` 를 방 전원에게 보낸다. 방은 해체하지 않는다.
  마지막 사람이 나가면 방을 삭제한다. 5분 주기로 빈 방을 청소하는 안전장치도 있다.
- 방 개수 상한 40, 64KB 초과 프레임 무시, 잘못된 경로 접속은 1008로 거절.

### 프로토콜 (JSON, 최상위 키 `t`)
| 방향 | 메시지 | 내용 |
| --- | --- | --- |
| 클라→서버 | `hello {name}` | 접속 인사 · 닉네임 등록 |
| | `list_rooms` | 방 목록 요청 |
| | `create_room {name, max, secs, win}` | 방 생성 (생성자가 방장) |
| | `join {room}` | 입장 |
| | `leave` | 퇴장 |
| | `relay {data}` | 같은 방 상대에게 그대로 전달 **(게임 상태 자리 — 지금도 동작)** |
| | `ping {ts}` | 왕복 지연 측정 |
| 서버→클라 | `welcome {id, name}` | 내 접속 id |
| | `room_list {rooms[]}` | 방 목록 (로비에 있는 사람에게만) |
| | `joined {room, you}` | 입장 성공. `you` = `host` \| `guest` |
| | `room_update {room, members}` | 인원·설정 변화 (같은 방 전원) |
| | `host_changed {host, name}` | 방장 위임 |
| | `peer {event, id, name}` | 상대 입장/퇴장 |
| | `left` / `error {msg}` / `pong {ts}` | |

### 상시 구동 · 배포 위치
| 항목 | 값 |
| --- | --- |
| 서버 코드 | `~/land-grab-game/server/ws_server.py` — **레포에서 그대로 실행**. 복사본 없음 |
| 기동 / 종료 | `server/ws_server_on.sh` (멱등) / `server/ws_server_off.sh` |
| 로그 | `server/logs/ws_server.log` |
| 정적 페이지 | `~/.openclaw-mir/workspace/land-grab/index.html` (Flask가 `/game/` 로 서빙) |
| 현재 PID | WS **3109063** · cloudflared **3104348** |

재부팅 자동 기동은 `server/install_autostart.sh` 로 `crontab @reboot` 에 WS·Flask·cloudflared 셋을
등록하게 만들어 뒀다. **아직 실행하지 않았다** — 시스템 설정 변경이라 지시를 기다린다.

---

## 로비 · 방 만들기 UI (`index.html`)
- 로비 진입 시 `wss://<현재호스트>/game/ws` 접속, 메뉴로 나가면 끊는다.
  끊기면 **1→2→4→8초로 자동 재접속**하고 남은 시간을 상단에 표시한다.
- **방 목록**: 문 슬롯 6개를 미리 만들어 두고 표시·색·라벨만 갈아끼운다(GC 방지).
  라벨은 `이름` + `2 / 3 · 2분 · 대기`. 대기 초록 / 진행 주황.
  개수에 맞춰 가운데 정렬되고, 정원이 차면 프롬프트가 `가득 참` 으로 바뀐다.
- **방 만들기**: 금색 발판 앞 `E` → 설정 폼(포인터 잠금 해제).
  이름 입력 + 인원 `2/3/4` + 제한시간 `1/2/3/5분` + 승리 점령률 `60%/없음`.
  Enter로 확정, ESC로 취소.
- **대기실**: 방 이름, 설정 요약(`인원 3명 · 제한 2분 · 승리 60%`), 참가자 목록(방장·본인 표시),
  `게임 시작`(**방장에게만 보임**), `방 나가기`. 인원이 바뀌면 실시간 갱신된다.
- 모든 텍스트는 `textContent` 로만 넣는다. **`innerHTML` 사용 0건** (실측 확인).

---

## 변경 파일 목록

### land-grab-game 레포
| 파일 | 변경 |
| --- | --- |
| `server/ws_server.py` | 방 설정(정원·시간·승리조건), 값 검증, `host_changed` 추가 |
| `server/ws_server_on.sh` / `ws_server_off.sh` | 멱등 기동/종료 |
| `server/install_autostart.sh` | 재부팅 자동 기동 등록 (**작성만, 실행 안 함**) |
| `index.html` | 설정 폼, 목록 라벨에 시간, 대기실 설정 표시, 방장 위임 처리, 시작 버튼 |
| `docs/08-ws-rooms.md` | 본 문서 (이전 `08-a-ws-rooms.md` 를 대체) |

### 프로덕션 (레포 밖)
| 파일 | 이번 변경 | 백업 |
| --- | --- | --- |
| `~/.cloudflared/config-valuetopic.yml` | **없음** (이전 작업에서 적용 완료) | `.bak-20260912-194340` (그 전 `.bak-20260912-191018`, `.bak-20260912-192926`) |
| `~/.openclaw-mir/workspace/valuetopic/app.py` | **없음** | `.bak-20260912-194340` (그 전 2개) |
| `~/.openclaw-mir/workspace/land-grab/index.html` | 배포본 갱신 | 레포가 원본 |

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
cp ~/.cloudflared/config-valuetopic.yml ~/.cloudflared/config-valuetopic.yml.bak-$(date +%Y%m%d-%H%M%S)
cp ~/.openclaw-mir/workspace/valuetopic/app.py ~/.openclaw-mir/workspace/valuetopic/app.py.bak-$(date +%Y%m%d-%H%M%S)
cloudflared --config ~/.cloudflared/config-valuetopic.yml tunnel ingress rule https://valuetopic.com/game/ws
server/ws_server_off.sh && server/ws_server_on.sh
cp index.html ~/.openclaw-mir/workspace/land-grab/index.html
```

## 문법 검사 결과
- `index.html` `<script type="module">` **1,275줄 → `node --check` 통과**. importmap JSON 통과.
- `getElementById` 대상 **40개 전부 HTML에 존재** → 누락 0.
- `server/ws_server.py` → **`python3 -m py_compile` 통과**.
- 셸 스크립트 3종 → `bash -n` 통과.
- `innerHTML` 검색 → **0건**.

## 동작 검증

**1. 서버 — 설정·정원·위임·값 검증** (로컬 5002)
```
생성 : 4인 5분방 | 정원 4 | 시간 300초 | 승리 60 | 상태 wait
입장 : 세모 → 2/4 wait · 손님1 → 3/4 wait · 손님2 → 4/4 play
5번째 입장 → "방이 가득 찼습니다."
방장 퇴장 → host_changed(세모) · 방 유지 3/4 wait
잘못된 값(이름 50자·정원 99·시간 7·승리 "해킹") → 20자 · 정원 2 · 180초 · 승리 없음
```

**2. 두 탭 + 로비 관전 탭** (실서버·실터널 경유, 클라이언트 코드 경로 그대로)
```
탭A(방장) : 정현의 3인방 | 인원 3명 · 제한 2분 · 승리 60% | 참가자를 기다리는 중… (2/3)
            1. 플레이어-2580 (나) 방장 | 2. 플레이어-3108 참가 | 게임 시작 버튼 표시됨
탭B(참가) : 같은 방·같은 설정 | 1. 플레이어-2580 방장 | 2. 플레이어-3108 (나) 참가
            게임 시작 버튼 숨김
탭C(로비) : "온라인 연결됨 · 방 1개"  ← 목록 실시간 반영
서버로그   : 방 생성 8f037d "정현의 3인방" (정원 3 · 120초 · 승리 60%) → 방 입장 ← 플레이어-3108
```
설정 폼은 **실제 UI 버튼을 눌러** 3명·2분·60%를 선택했다.

**3. 배포된 실URL** (`https://valuetopic.com/game/`, 61,448 bytes)
```
설정 폼 요소(opt-max/opt-secs/opt-win/room-setting) 서빙 확인
wss 경유 생성: 실URL 4인방 | 정원 4 | 시간 300 | 승리 없음
wss 경유 입장: 2/4 · wait
```

**4. 화면** — 설정 폼, 로비 문 라벨(이름·인원·시간·상태), 대기실 패널 스크린샷 확인.

## 새 커밋 해시
- `__COMMIT__`

## 알려진 버그 · 미완
1. **자동 기동 미적용.** 재부팅하면 WS 서버와 cloudflared가 죽는다. 등록 스크립트는 준비돼 있다.
2. **인증 없음.** 닉네임을 클라이언트가 그대로 보낸다. 사칭·중복이 가능하다.
3. **방 목록 상한 6개** (문 슬롯 수). 그 이상은 화면에 안 나온다. 페이지 넘김 필요.
4. **재접속해도 있던 방으로 자동 복귀하지 않는다.** 로비로 돌아간다.
5. **방 설정은 만든 뒤 바꿀 수 없다.** 바꾸려면 나갔다 새로 만들어야 한다.
6. **걷기 조작은 자동 검증 불가.** 헤드리스 크롬이 포인터 잠금을 허용하지 않는다
   (신뢰된 마우스 이벤트로도 `pointerLockElement` OFF). 검증에서 "걸어가서 E" 두 동작만
   함수 호출로 대체했고, 나머지는 실제 코드 경로를 그대로 탔다.
7. 게임 동기화 없음 — 정원이 차도 대기실에서 멈춘다 (다음 단계 범위).

## 감독 확인 요청 사항
1. **두 탭으로 직접 확인 부탁드린다.** `valuetopic.com/game/` → 온라인으로 플레이 →
   금색 발판 앞 `E` 로 설정해서 방 생성 → 다른 탭에서 그 문 앞 `E` 로 입장 → 인원 증가 확인.
2. **자동 기동 등록 여부** 지시 바란다 (`server/install_autostart.sh`).
3. **승리 점령률 60%는 06 문서에서 지적한 대로 현실적으로 발동하지 않는다** (3분에 5~10% 수준).
   20~30%로 낮추거나 맵을 줄이는 편이 낫다. 이 값을 방 설정 선택지에 넣을지도 같이 정해달라.
4. 다음 단계(게임 동기화)에서 **마일스톤 B를 건너뛰어도 되는지** — 격자·궤적·점령·미니맵·승패는
   06~07단계에서 이미 만들어 검증까지 끝났다. 봇만 빼면 그대로 다인용이다.
