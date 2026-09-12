# 04 - 시작화면 2버튼 + 화면전환 + 온라인 로비 셸

## 무엇을 했나
- 단일 오버레이("클릭하여 시작")를 걷어내고 **menu / lobby / game 3화면 상태 구조**를 넣었다.
- 시작화면을 **[봇과 플레이] / [온라인으로 플레이]** 2버튼으로 재구성하고, 온라인 로비 UI 셸을 만들었다.
- 지시대로 **UI 셸만**이다. 땅따먹기 로직·봇·실제 WebSocket 연결은 넣지 않았다.

---

## 변경 파일 목록
| 파일 | 변경 |
| --- | --- |
| `index.html` | 272줄 → **467줄**. 화면 상태·메뉴·로비·일시정지·토스트 추가. 3D 이동 코드는 그대로 유지 |
| `docs/04-menu-lobby-shell.md` | 신규, 본 문서 |
| `workspace/land-grab/index.html` | (레포 밖) 배포본 갱신 — valuetopic `/game/` 이 서빙 |

### 1. 화면 상태 구조
```js
let screen = 'menu';            // 'menu' | 'lobby' | 'game'
function showScreen(name) { ... }   // .on 클래스 토글 + HUD·조준점 표시 + 포인터 잠금 해제
```
- `SCREENS` 객체 하나로 DOM을 모아 관리한다. 화면을 추가할 때 여기에 한 줄만 넣으면 된다.
- `game` 진입이 아니면 항상 포인터 잠금을 해제한다 — 화면 전환 시 잠금이 남는 사고를 막는다.
- `lobby` 진입 시 `renderRooms()` 를 호출한다. 나중에 서버 연동은 이 함수 안만 교체하면 된다.
- **일시정지(pause)는 별도 화면이 아니라 game의 하위 상태**로 뒀다. ESC로 잠금이 풀린 상태일 뿐
  게임을 떠난 것이 아니기 때문이다. 상태 변수는 `paused`.

### 2. 시작화면 (menu)
- 제목 + 버튼 2개. 각 버튼에 부제(`.sub`)를 달아 무엇을 하는 버튼인지 설명한다.
- `[봇과 플레이]` → `showScreen('game')` + 포인터 잠금 요청. 현재 3D 이동이 그대로 동작한다.
- `[온라인으로 플레이]` → `showScreen('lobby')`.

### 3. 온라인 로비 (lobby)
- 상단에 **"온라인 서버 미연결 — 08단계 예정입니다"** 경고 배너를 고정 노출.
- 방 목록: 이름 / 인원 `1 / 2` / 상태 뱃지(대기·진행). 예시 2개(`연습방`, `빠른대전`)를 넣었다.
  목록이 비면 "열린 방이 없습니다" 빈 상태가 대신 뜬다 (서버 연결 후 바로 쓰인다).
- `[방 만들기]` → 토스트 "방 만들기 준비 중입니다"
- 방 클릭 → 토스트 "온라인 대전 준비 중입니다"
- `[새로고침]` → 목록 재렌더 + 미연결 안내 토스트
- `[← 뒤로]` 및 **ESC** → menu 복귀
- 방 목록은 `textContent` + `createElement` 로만 그린다. `innerHTML` 을 쓰지 않았다 —
  나중에 서버가 주는 방 이름이 그대로 들어올 자리라, 지금부터 XSS 여지를 두지 않는 편이 낫다.

### 4. ESC / 뒤로 흐름
| 상황 | ESC 동작 |
| --- | --- |
| lobby | menu 복귀 |
| game (잠금 상태) | 브라우저가 잠금 해제 → `pointerlockchange` → **일시정지 화면** |
| game (잠금이 안 걸린 상태) | 이벤트가 안 오므로 **직접 일시정지 화면**을 띄운다 |
- 일시정지 화면: `[계속하기]`(재잠금) / `[메뉴로 나가기]`
- **갇힘 방지 장치 2개**를 넣었다. (a) 잠금 요청이 거부되면 `pointerlockchange` 가 오지 않아
  조작 불가 화면에 갇힌다 → 진입 0.5초 뒤 잠금 여부를 확인해 일시정지를 띄운다.
  (b) 재잠금은 ESC 직후 브라우저 쿨다운으로 거부될 수 있어, Promise 거부 시 안내 토스트를 띄운다.
- 잠금 해제·창 포커스 이탈 시 눌린 키를 전부 비운다 (키 고착 방지, 기존 유지).

### 5. 렌더 루프
- 메뉴·로비에서도 3D 씬은 계속 그린다 (반투명 배경 뒤로 보이는 편이 낫다).
- **플레이어 갱신은 `screen === 'game' && locked` 일 때만** 돈다. 메뉴에서 WASD가 먹지 않는다.

---

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
python3 -c "..."                 # <script type=module> 블록 추출 → check.mjs
node --check check.mjs           # 문법 검사
cp index.html ~/.openclaw-mir/workspace/land-grab/index.html   # valuetopic 배포
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/game/
git add . && git commit && git push origin main
```
로컬 확인:
```bash
cd ~/land-grab-game && python3 -m http.server 8000   # → http://localhost:8000
```

## 문법 검사 결과 (node --check 통과 여부)
- `<script type="module">` 블록 1개, 320줄 추출 → **`node --check` 통과** (`.mjs` 확장자로 검사).
- `<script type="importmap">` JSON **파싱 통과**.
- 추가 점검: `getElementById` 대상 **16개 전부**가 HTML에 실제로 존재하는지 확인 → **누락 0건**.
  (오타 하나면 해당 버튼이 조용히 죽는데 문법 검사로는 안 잡힌다.)

## 배포 URL
| 경로 | 상태 |
| --- | --- |
| **https://valuetopic.com/game/** | **반영 완료** — 로컬 실측 200, 19,750 bytes, 신규 화면 id 6개 모두 서빙 확인 |
| GitHub Pages | **여전히 미활성** — 01단계와 동일 (토큰 권한 부족) |

GitHub Pages는 이번에도 켜지지 않았다. `gh api repos/.../pages` 가 여전히 404다.
**Settings → Pages → Deploy from a branch → `main` / `/ (root)`** 를 정현님이 눌러주셔야 한다.
활성화 시 주소는 `https://jh82130351.github.io/land-grab-game/`.

## 새 커밋 해시
- `55b11cf`

## 감독 확인 요청 사항 / 남은 이슈
1. **로비 예시 방 2개는 가짜 데이터다** (`DUMMY_ROOMS`). 08단계에서 서버 응답으로 교체한다.
   지금 클릭하면 안내 토스트만 뜬다.
2. **방 최대 인원을 2로 가정**해 표시했다 (`1 / 2`). 실제 인원 수는 게임 방식 확정에 달렸다.
   4인 이상이면 로비 표시와 방 구조를 지금 바꾸는 편이 싸다.
3. **게임 방식은 여전히 미확정.** 05단계(땅따먹기 궤적·점령)부터는 막힌다.
   턴제/실시간, 인원, 보드 크기, 승리 조건 확정 부탁드린다.
4. 모바일 미지원은 그대로다 (포인터 잠금·키보드 전제).
5. valuetopic `app.py`·`base.html` 변경이 아직 버전관리 밖에 있다 (03 문서 1번, 미해결).
