# 08-A - WS 서버 + 방 시스템 (마일스톤 A)

## 무엇을 했나
- **Python WebSocket 서버(포트 5002)** 를 만들어 방 생성·목록·입장·퇴장(정원 2)을 처리한다.
- **Cloudflare Tunnel에 경로 규칙을 추가**해 `wss://valuetopic.com/game/ws` 가 5002로 들어간다.
- **3D 로비를 실서버에 연결**했다. 방 목록이 실시간으로 문 오브젝트에 반영되고, 걸어가서 E로 입장한다.
- 게임 동기화(마일스톤 C)는 아직 없다. 입장하면 대기방 화면이 뜬다.

---

## 구조

### 서버 — `server/ws_server.py`
역할을 딱 둘로 한정했다. **방 관리**와 **중계**다. 게임 계산은 하지 않는다.
```
클라 → 서버 : hello / list / create / join / leave / relay / ping
서버 → 클라 : welcome / rooms / joined / room / peer / left / error / pong
```
- `rooms` 는 **로비에 있는 사람에게만** 보낸다 (방 안에 있는 사람은 목록이 필요 없다).
- `relay` 는 같은 방의 상대에게 내용을 그대로 넘긴다. **서버는 내용을 보지 않는다.**
  마일스톤 C에서 방장이 계산한 게임 상태가 이 통로로 간다.
- 방장이 나가면 **남은 사람이 방장이 된다.** 방이 비면 삭제한다.
- 방어 장치: 방 개수 상한 40, 방 이름 20자, 프레임 64KB 초과 무시, 빈 방 청소 타이머.

### 터널 — `~/.cloudflared/config-valuetopic.yml`
```yaml
ingress:
  - hostname: valuetopic.com
    path: ^/game/ws          # ← 포괄 규칙보다 반드시 위
    service: http://localhost:5002
  - hostname: www.valuetopic.com
    path: ^/game/ws
    service: http://localhost:5002
  - hostname: valuetopic.com
    service: http://localhost:5001
  ...
```
- 규칙은 **위에서부터** 평가되므로 경로 규칙이 먼저 와야 한다.
- 서비스 스킴은 `ws://` 가 아니라 **`http://`** 다. cloudflared가 업그레이드를 알아서 처리한다.
- `cloudflared --config <파일> tunnel ingress validate` 로 검증했고, 규칙 매칭도 확인했다.
  (`--config` 는 **서브커맨드 앞**에 와야 한다. 뒤에 쓰면 도움말만 나온다.)

### 클라이언트 — `index.html`
- 로비 진입 시 `wss://<현재호스트>/game/ws` 로 접속한다. 메뉴로 나가면 끊는다.
- **문 슬롯 6개를 미리 만들어 두고** 목록이 오면 표시/색/라벨만 갈아끼운다.
  매번 생성·폐기하면 GC가 튄다. 라벨은 캔버스를 들고 있다가 다시 그린다.
- 보이는 방 개수에 맞춰 문을 **가운데 정렬**한다.
- 방 상태 색: **대기 초록 / 진행 주황**. 가득 찬 방은 프롬프트가 "가득 참"으로 바뀐다.
- 입장하면 **대기방 화면** — 방 이름, 인원, 참가자 목록(방장 표시, 본인 표시), 나가기.
- 닉네임은 `localStorage` 에 저장한다 (없으면 `플레이어-1234` 형태로 생성).
- 연결 상태를 로비 상단에 항상 표시한다: `온라인 연결됨 · 방 2개` / `연결 끊김`.

---

## 변경 파일 목록
| 파일 | 변경 |
| --- | --- |
| `server/ws_server.py` | **신규** — WS 방 서버 (약 300줄) |
| `server/ws_server_on.sh` / `ws_server_off.sh` | 신규 — 멱등 기동/종료 스크립트 |
| `server/.gitignore` | 신규 — logs·pid 제외 |
| `index.html` | 1,225줄 → **1,437줄**. 로비 슬롯화, 네트워크 계층, 대기방 화면 |
| `~/.cloudflared/config-valuetopic.yml` | (레포 밖) ingress 2줄 그룹 추가 |
| `workspace/land-grab/index.html` | (레포 밖) 배포본 갱신 |

**백업**은 수정 전에 만들었다.
`config-valuetopic.yml.bak-20260912-191018`, `app.py.bak-20260912-191018` (app.py는 결국 수정하지 않음).

## 배포 위치 · 운영
| 항목 | 값 |
| --- | --- |
| 서버 코드 | `~/land-grab-game/server/ws_server.py` (레포 그대로 실행. 복사본 없음) |
| 기동 | `~/land-grab-game/server/ws_server_on.sh` (멱등) |
| 종료 | `~/land-grab-game/server/ws_server_off.sh` |
| 로그 | `server/logs/ws_server.log` |
| 현재 PID | WS 3104155 · cloudflared 3104348 |
| 터널 로그 | `~/.cloudflared/tunnel-valuetopic.log` |

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
cp ~/.cloudflared/config-valuetopic.yml ~/.cloudflared/config-valuetopic.yml.bak-$(date +%Y%m%d-%H%M%S)
server/ws_server_on.sh
cloudflared --config ~/.cloudflared/config-valuetopic.yml tunnel ingress validate
kill -TERM $(pgrep -x cloudflared)
nohup cloudflared tunnel --config ~/.cloudflared/config-valuetopic.yml run valuetopic-tunnel >> ~/.cloudflared/tunnel-valuetopic.log 2>&1 &
cp index.html ~/.openclaw-mir/workspace/land-grab/index.html
```

## 문법 검사 결과
- `index.html` `<script type="module">` **1,179줄 → `node --check` 통과**. importmap JSON 통과.
  `getElementById` 대상 **31개 전부 존재** (누락 0).
- `server/ws_server.py` → **`python3 -m py_compile` 통과**.
- 기동 스크립트 2개 → `bash -n` 통과.

## 동작 검증
**1. 로컬 (ws://127.0.0.1:5002)** — 파이썬 클라이언트 2개로 전 과정 확인
```
A 방 생성: 테스트방 | 역할 host | 상태 wait
B가 본 목록(실시간): [('실시간확인방', '1/2', 'wait')]
B 입장: 역할 guest | 상태 play
3번째 입장 시도 → "방이 가득 찼습니다"
중계 수신: {'x': 1, 'y': 2}
A 퇴장 → 방장이 B로 이양, 상태 wait
```

**2. 터널 경유 (wss://valuetopic.com/game/ws)**
```
wss 연결 성립 (0.69s)
탭B가 실시간 수신한 방 목록: [('터널테스트방', '1/2', 'wait')]
탭B 입장 성공: 역할 guest | 인원 2/2 | 상태 play
```

**3. 배포된 실제 페이지** — 헤드리스 크롬(CDP)으로 실URL을 띄워 확인
```
탭A 초기 상태 : 온라인 연결됨 · 열린 방 없음
탭A 방 생성 후: 온라인 연결됨 · 방 1개      ← 남이 만든 방이 실시간 반영
2인 입장 확인 : 세모의 방 2/2 · 상태 play · 역할 guest
```

**4. 화면 확인** (스크린샷)
- 로비: 문 3개가 가운데 정렬되고 라벨에 이름·인원·상태 표시. 진행 중인 방은 주황.
- 대기방: 방 이름, "두 명이 모였습니다", 참가자 2명(방장/참가·본인 표시), 입장 토스트.

검증 중 **버그 2개를 잡아 고쳤다.**
- 문 슬롯 6개(간격 8.2m)가 40m 로비에 안 들어가 벽을 뚫었다 → 로비를 56m로.
- 방이 3개일 때 문이 왼쪽으로 쏠렸다 → 개수에 맞춰 가운데 정렬.

## 배포 URL
| 경로 | 상태 |
| --- | --- |
| **https://valuetopic.com/game/** | 200 · 정상 |
| **wss://valuetopic.com/game/ws** | 연결 성립 · 방 생성/입장 동작 |
| 기존 사이트 (`/`, `/region/*` 등) | 재기동 후 200 확인 |

## 새 커밋 해시
- `17dcc4e`

## 알려진 버그 · 미완
1. **WS 서버가 부팅 시 자동 기동되지 않는다.** 지금은 수동 기동 상태다.
   서버가 재부팅되면 온라인 기능이 죽는다. cron `@reboot` 이나 systemd 등록이 필요하다 (지시 대기).
2. **cloudflared도 수동 기동이다.** 원래부터 그랬다(6월부터 떠 있던 프로세스). 같은 문제.
3. **인증이 없다.** 닉네임을 클라이언트가 그대로 보낸다. 사칭·도배가 가능하다.
   공개 서비스로 열 거면 최소한의 제한이 필요하다.
4. **방 목록 상한이 6개**다 (문 슬롯 수). 그 이상은 화면에 안 나온다.
5. 게임 동기화는 아직 없다. 2인이 모여도 대기방에서 멈춘다 (마일스톤 C 범위).

## 감독 확인 요청 사항
1. **두 브라우저 탭으로 직접 확인 부탁드린다.** `valuetopic.com/game/` → 온라인으로 플레이 →
   한쪽에서 금색 발판 앞 E로 방 생성, 다른 쪽에서 그 문 앞 E로 입장.
   헤드리스에서는 포인터 잠금이 안 걸려 걸어다니는 조작까지는 자동 검증을 못 했다.
   (서버·터널·목록 반영은 위 3번 항목으로 실URL 검증 완료)
2. **자동 기동을 걸어둘지** 지시 바란다 (WS 서버 + cloudflared).
3. 마일스톤 B(게임 본체)는 06~07단계에서 이미 만들어 둔 격자·궤적·점령·미니맵이 그대로 쓰인다.
   봇만 빼고 2인용으로 돌리면 되므로, **B를 건너뛰고 C(동기화)로 바로 가도 되는지** 확인 바란다.
