# 08-A - WS 서버 + 방 시스템 (방 선택·입장까지)

## 무엇을 했나
- **Python WebSocket 서버(포트 5002)** 로 방 생성·목록·입장·퇴장·방장 위임·빈 방 정리를 처리한다.
- **Cloudflare Tunnel에 경로 규칙**을 추가해 `wss://valuetopic.com/game/ws` 가 5002로 들어간다.
- **3D 로비를 실서버에 연결**했다. placeholder를 걷어내고 서버 목록을 실시간 표시한다.
  방 만들기는 이름 입력 → 대기실, 방 문 앞 E → 입장.
- 연결 끊김 시 **자동 재접속**(1→2→4→8초), 상대 입퇴장 안내를 넣었다.
- 게임 동기화는 다음 단계다. 대기실의 `게임 시작` 버튼은 비활성 상태로 자리만 잡아뒀다.

---

## 서버 구조

### 파일 — `server/ws_server.py` (약 320줄)
역할을 둘로 한정했다. **방 관리**와 **중계**다. 게임 계산은 하지 않는다.
- 방장이 나가면 **남은 사람이 방장**이 된다. 방이 비면 즉시 삭제한다.
- `room_list` 는 **로비에 있는 사람에게만** 보낸다. 방 안에 있으면 목록이 필요 없다.
- `relay` 는 같은 방 상대에게 내용을 그대로 넘긴다. **서버는 내용을 해석하지 않는다.**
  마일스톤 C에서 방장이 계산한 게임 상태가 이 통로로 간다. **중계 뼈대는 지금 동작한다.**
- 방어 장치: 방 개수 상한 40, 방 이름 20자, 64KB 초과 프레임 무시, 5분 주기 빈 방 청소,
  잘못된 경로 접속 거부(1008).

### 프로토콜 (JSON, 최상위 키 `t`)
| 방향 | 메시지 | 내용 |
| --- | --- | --- |
| 클라→서버 | `hello {name}` | 접속 인사 · 닉네임 등록 |
| | `list_rooms` | 방 목록 요청 |
| | `create_room {name}` | 방 생성 (생성자가 방장) |
| | `join {room}` | 입장 |
| | `leave` | 퇴장 |
| | `relay {data}` | 같은 방 상대에게 그대로 전달 **(게임 상태 자리)** |
| | `ping {ts}` | 왕복 지연 측정 |
| 서버→클라 | `welcome {id,name}` | 내 접속 id |
| | `room_list {rooms[]}` | 방 목록 (로비 한정) |
| | `joined {room, you}` | 입장 성공. `you` = `host` \| `guest` |
| | `room_update {room, members}` | 인원 변화 (같은 방 전원) |
| | `peer {event,id,name}` | 상대 입장/퇴장 (`join`\|`leave`) |
| | `left` / `error {msg}` / `pong {ts}` | |

`room` 객체는 `{id, name, players, max, state, host}`, `state` 는 `wait`(1/2) \| `play`(2/2).

### 터널 — `~/.cloudflared/config-valuetopic.yml`
```yaml
ingress:
  - hostname: valuetopic.com
    path: ^/game/ws          # ← 포괄 규칙보다 반드시 위 (위에서부터 평가된다)
    service: http://localhost:5002
  - hostname: www.valuetopic.com
    path: ^/game/ws
    service: http://localhost:5002
  - hostname: valuetopic.com
    service: http://localhost:5001     # 기존 웹사이트
  ...
```
- 서비스 스킴은 `ws://` 가 아니라 **`http://`** 다. cloudflared가 업그레이드를 알아서 처리한다.
- `--config` 는 **서브커맨드 앞**에 와야 한다. 뒤에 쓰면 도움말만 나온다.
  (`cloudflared --config <파일> tunnel ingress validate` → OK)

### 클라이언트 — `index.html`
- 로비 진입 시 `wss://<현재호스트>/game/ws` 접속. 메뉴로 나가면 끊는다.
- **문 슬롯 6개를 미리 만들어 두고** 목록이 오면 표시·색·라벨만 갈아끼운다.
  매번 생성·폐기하면 GC가 튄다. 라벨은 캔버스를 들고 있다가 다시 그린다.
- 보이는 방 개수에 맞춰 문을 **가운데 정렬**. 대기 초록 / 진행 주황, 가득 차면 프롬프트가 "가득 참".
- **방 만들기**: 금색 발판 앞 `E` → 이름 입력 화면(포인터 잠금 해제, 기본값 채워짐, Enter 확정, ESC 취소).
- **대기실**: 방 이름, 인원 안내, 참가자 목록(방장·본인 표시), `게임 시작`(방장에게만 보임, 비활성), `방 나가기`.
- **연결 관리**: 상단에 `온라인 연결됨 · 방 2개` / `연결 끊김 — 2초 후 재연결` 을 항상 표시.
  끊기면 1→2→4→8초로 재접속을 재시도한다. 방 안에서 끊기면 로비로 돌려보낸다.
- 닉네임은 `localStorage` 에 저장 (없으면 `플레이어-1234` 생성).

---

## 변경 파일 목록

### land-grab-game 레포
| 파일 | 변경 |
| --- | --- |
| `server/ws_server.py` | 신규 — WS 방 서버 |
| `server/ws_server_on.sh` / `ws_server_off.sh` | 신규 — 멱등 기동/종료 |
| `server/install_autostart.sh` | 신규 — 재부팅 자동 기동 등록 (**작성만, 실행 안 함**) |
| `server/.gitignore` | 신규 — logs·pid 제외 |
| `index.html` | 로비 슬롯화, 네트워크 계층, 방 만들기 화면, 대기실, 재접속 |
| `docs/08-a-ws-rooms.md` | 본 문서 |

### 프로덕션 (레포 밖)
| 파일 | 변경 | 백업 |
| --- | --- | --- |
| `~/.cloudflared/config-valuetopic.yml` | ingress 경로 규칙 2개 추가 | `config-valuetopic.yml.bak-20260912-191018`, `.bak-20260912-192926` |
| `~/.openclaw-mir/workspace/valuetopic/app.py` | **변경 없음** (백업만) | `app.py.bak-20260912-191018`, `.bak-20260912-192926` |
| `~/.openclaw-mir/workspace/land-grab/index.html` | 배포본 갱신 | (레포가 원본) |

## 배포 위치 · 상시 구동
| 항목 | 값 |
| --- | --- |
| 서버 코드 | `~/land-grab-game/server/ws_server.py` — **레포에서 그대로 실행**. 복사본 없음 |
| 기동 / 종료 | `server/ws_server_on.sh` (멱등) / `server/ws_server_off.sh` |
| 로그 | `server/logs/ws_server.log` |
| 정적 페이지 | `~/.openclaw-mir/workspace/land-grab/index.html` (Flask가 `/game/` 로 서빙) |
| 현재 PID | WS **3107108** · cloudflared **3104348** · Flask 5001 기존 프로세스 |

**상시 구동**은 `server/install_autostart.sh` 로 `crontab @reboot` 에 세 가지(WS·Flask·cloudflared)를
등록하도록 만들어 뒀다. **아직 실행하지 않았다** — 시스템 설정 변경이라 지시를 기다린다.
```bash
server/install_autostart.sh          # 등록
server/install_autostart.sh --show   # 확인
server/install_autostart.sh --remove # 해제
```

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
cp ~/.cloudflared/config-valuetopic.yml ~/.cloudflared/config-valuetopic.yml.bak-$(date +%Y%m%d-%H%M%S)
cp ~/.openclaw-mir/workspace/valuetopic/app.py ~/.openclaw-mir/workspace/valuetopic/app.py.bak-$(date +%Y%m%d-%H%M%S)
server/ws_server_on.sh
cloudflared --config ~/.cloudflared/config-valuetopic.yml tunnel ingress validate
kill -TERM $(pgrep -x cloudflared)
nohup cloudflared tunnel --config ~/.cloudflared/config-valuetopic.yml run valuetopic-tunnel \
      >> ~/.cloudflared/tunnel-valuetopic.log 2>&1 &
cp index.html ~/.openclaw-mir/workspace/land-grab/index.html
```

## 문법 검사 결과
- `index.html` `<script type="module">` **1,225줄 → `node --check` 통과**. importmap JSON 통과.
  `getElementById` 대상 **36개 전부 존재** (누락 0).
- `server/ws_server.py` → **`python3 -m py_compile` 통과**.
- 셸 스크립트 3종 → `bash -n` 통과.

## 동작 검증

**1. 서버 단독 (ws://127.0.0.1:5002)**
```
A 방 생성 → 역할 host, 상태 wait
B 실시간 목록 수신 → [('실시간확인방','1/2','wait')]
B 입장 → 역할 guest, 상태 play
3번째 입장 시도 → "방이 가득 찼습니다"
relay 중계 → {'x':1,'y':2} 상대에게 도달
A 퇴장 → 방장이 B로 위임, 상태 wait, 목록 갱신
```

**2. 터널 경유 (wss://valuetopic.com/game/ws)** — 연결 0.69초, 목록·입장 정상.

**3. 배포된 실제 페이지 (https://valuetopic.com/game/)**
```
탭A 초기 상태 : 온라인 연결됨 · 열린 방 없음
남이 방 생성 후: 온라인 연결됨 · 방 1개     ← 실시간 반영
```

**4. 두 탭에서 같은 방 입장** — 실서버·실터널 사용, 클라이언트 코드 경로 그대로
```
탭A 화면 : screen-room · 정현의 방 · "두 명이 모였습니다"
탭A 인원 : 1. 플레이어-2978 (나) 방장 | 2. 플레이어-5606 참가
탭B 화면 : screen-room · 정현의 방
탭B 인원 : 1. 플레이어-2978 방장 | 2. 플레이어-5606 (나) 참가
서버로그 : 방 생성 87ffae "정현의 방" → 방 입장 87ffae ← 플레이어-5606
```
**단, 이 검증에서 "걸어가서 E" 부분만 함수 호출로 대체했다.** 헤드리스 크롬은
포인터 잠금을 허용하지 않아(신뢰된 마우스 이벤트로도 `pointerLockElement`가 OFF) 이동 조작을 자동화할 수 없다.
방 생성·목록·입장·대기실 표시는 전부 실제 코드 경로를 그대로 탔다.

**5. 화면 확인** — 로비(문 3개, 이름·인원·상태 라벨, 진행 중인 방 주황), 방 만들기 입력 화면,
대기실(방장/참가·본인 표시), 입장 토스트.

검증 중 **버그 2개를 잡아 고쳤다.**
- 문 슬롯 6개(간격 8.2m)가 40m 로비에 안 들어가 벽을 뚫었다 → 로비 56m로 확장.
- 방이 3개일 때 문이 왼쪽으로 쏠렸다 → 개수에 맞춰 가운데 정렬.

## 배포 URL
| 경로 | 상태 |
| --- | --- |
| **https://valuetopic.com/game/** | 200 · 58,471 bytes |
| **wss://valuetopic.com/game/ws** | 연결 성립 · 방 생성/입장 동작 |
| 기존 사이트 (`/`, `/region/*`) | 터널 재기동 후 200 확인 |

## 새 커밋 해시
- `__COMMIT__`

## 알려진 버그 · 미완
1. **자동 기동 미적용.** WS 서버도 cloudflared도 수동 기동 상태다. 재부팅하면 온라인 기능이 죽는다.
   등록 스크립트는 준비돼 있고 실행만 하면 된다 (지시 대기).
2. **인증이 없다.** 닉네임을 클라이언트가 그대로 보낸다. 사칭·중복 이름이 가능하다.
3. **방 목록 상한 6개** (문 슬롯 수). 그 이상 열려도 화면에 안 나온다. 페이지 넘김이 필요하다.
4. **재접속해도 있던 방으로 자동 복귀하지 않는다.** 로비로 돌아간다.
5. **걷기 조작 자동 검증 불가** (위 4번 항목). 실제 두 탭 조작 확인은 사람 손이 필요하다.
6. 게임 동기화 없음 — 2/2가 되어도 대기실에서 멈춘다 (마일스톤 C 범위).

## 감독 확인 요청 사항
1. **두 브라우저 탭으로 직접 확인 부탁드린다.** `valuetopic.com/game/` → 온라인으로 플레이 →
   한쪽은 금색 발판 앞 `E` 로 방 생성, 다른 쪽은 그 문 앞 `E` 로 입장 → 2/2 확인.
2. **자동 기동을 등록할지** 지시 바란다 (`server/install_autostart.sh`).
3. 마일스톤 B(게임 본체)는 06~07단계 결과물이 그대로 쓰인다. 격자·궤적·점령·미니맵·승패가 이미 있고
   봇만 빼면 2인용이다. **B를 건너뛰고 C(동기화)로 바로 가도 되는지** 확인 바란다.
4. 06 문서의 밸런스 4개 항목(맵 크기·60% 조건·사망 페널티·봇 난이도)은 아직 답을 못 받았다.
