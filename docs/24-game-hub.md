# 24 - 게임 선택 허브 구조로 분리

## 무엇을 했나
`valuetopic.com/game/` 이 **게임 선택 허브**가 되고, 땅따먹기는 `/game/land-grab/` 으로 내려갔다.
게임을 늘릴 때 **Flask 코드를 다시 안 고쳐도 되는** 구조로 잡았다.

```
/game/                    게임 선택 허브 (카드 목록)
/game/land-grab/          땅따먹기
/game/<새 게임>/          폴더만 만들면 그대로 열린다
/game/ws                  온라인 WS — 손 안 댔다 (아래 참조)
```

---

## 1. 현 서빙 구조부터 확인했다 (A안을 택한 근거)

손대기 전에 실제 경로가 어떻게 도는지 확인했다.

| 층 | 확인한 것 |
| --- | --- |
| Cloudflare 터널 | `~/.cloudflared/config-valuetopic.yml` — `^/game/ws` 를 **Flask보다 먼저** `localhost:5002`로 보낸다 |
| Flask (5001) | `app.py` 의 `/game/` · `/game/<path:fn>` 이 `workspace/land-grab/` 폴더를 서빙 |
| 배포 | 레포의 `index.html` 을 `workspace/land-grab/index.html` 로 복사 |
| 사이트 | `templates/base.html` 푸터에 `<a href="/game/">게임1</a>` |

**핵심: `/game/ws` 는 터널이 Flask 앞에서 가로챈다.** 그래서 Flask 라우트를 어떻게 바꾸든
온라인 기능은 영향을 받지 않는다. 이게 A안(경로 분리)을 안심하고 고를 수 있었던 근거다.

무수정으로 가는 길(B안)도 있었다. 허브를 `land-grab/index.html` 자리에 놓고 게임을
`land-grab/land-grab/index.html` 로 넣으면 `app.py` 를 안 고쳐도 된다. 다만
**주소가 `/game/land-grab/index.html` 로 지저분해지고 폴더 이름이 겹친다.**
게임을 더 붙일 구조를 만드는 게 목적이라 **A안**으로 갔다.

## 2. 바뀐 것

### 폴더
| | 전 | 후 |
| --- | --- | --- |
| 레포 | `index.html` | `land-grab/index.html` · `hub/index.html` |
| 배포 | `workspace/land-grab/index.html` | `workspace/games/index.html` · `workspace/games/land-grab/index.html` |

옛 `workspace/land-grab/` 폴더는 **지우지 않고 그대로 뒀다.** `app.py` 만 되돌리면
즉시 원상복구된다.

### app.py (프로덕션 · 백업함)
```python
GAMES_DIR = os.path.join(WS_ROOT, 'games')
LANDGRAB_DIR = os.path.join(WS_ROOT, 'land-grab')   # 옛 경로 — 되돌릴 때를 위해 남겨 둔다

@app.route('/game/')            def game_index():  → games/index.html
@app.route('/game/<game>/')     def game_page(g):  → games/<g>/index.html
@app.route('/game/<path:fn>')   def game_static(): → games/<fn>
```
**게임을 늘릴 때 이 파일은 안 고쳐도 된다.** `games/` 아래에 폴더만 만들면 된다.

### templates/base.html (프로덕션 · 백업함)
푸터 라벨 `게임1` → `게임`. 링크 주소(`/game/`)는 그대로다. 허브가 생겼으니
"게임1"은 더 이상 맞는 이름이 아니다.

### 백업 파일
```
app.py.bak-20260914-202136
templates/base.html.bak-20260914-202330
```

## 3. 허브 페이지
게임 목록을 **배열 한 곳**에서 만든다. 늘릴 때 배열에 한 줄만 더하면 된다.
```js
const GAMES = [
  { id: 'land-grab', name: '땅따먹기', desc: '…', icon: '🟩',
    tags: ['3D', '1~4인', '봇전 · 온라인'], ready: true },
];
const SOON = 2;   // '준비 중' 자리 개수
```
- `id` 가 곧 `/game/<id>/` 주소이자 `games/<id>/` 폴더 이름이다.
- 썸네일은 지금 이모지 한 글자다. 이미지가 생기면 그 자리만 바꾸면 된다.
- 카드는 반응형 격자라 개수가 늘어도 알아서 접힌다.

---

## 4. 순단

Flask를 **두 번** 재기동했다 (라우트 반영 1회, 푸터 템플릿 반영 1회).
0.1초 간격으로 찔러 실제 끊긴 시간을 쟀다.

| 재기동 | 응답 성공 | 실패 | **순단** |
| --- | --- | --- | --- |
| app.py 반영 | 384회 | 7회 | **약 0.7초** |
| base.html 반영 | 384회 | 7회 | **약 0.7초** |

**WS 서버(5002)는 재기동하지 않았다.** 경기 중이던 방이 있었다면 끊기지 않았다.

---

## 5. 검증

### 라우트 (재기동 전에 격리해서 먼저 확인)
```
/game/                      200    4,293 bytes   허브
/game/land-grab/            200  126,265 bytes   땅따먹기
/game/land-grab/index.html  200  126,265 bytes   땅따먹기
/game/index.html            308                  /game/ 로 정리됨
/game/nope/                 404                  없는 게임
```

### 실URL
```
https://valuetopic.com/game/            200 · 4,293 bytes   · 허브
https://valuetopic.com/game/land-grab/  200 · 126,265 bytes · 땅따먹기
```
실URL이 내려주는 바이트가 **배포본과 완전히 같다** (`diff` 일치). 배포본은 레포와도 일치한다.

### 허브 화면
```
허브 제목      : 게임 선택
카드 수        : 3  (땅따먹기 1 + 준비 중 2)
땅따먹기 링크  : land-grab/
```

### 게임 페이지
```
제목        : 땅따먹기 — 3D
설정 버튼   : 있음
슬롯 3칸    : 있음
메뉴 버튼   : 봇과 플레이 · 온라인으로 플레이 둘 다 있음
콘솔 오류   : 없음
```

### 온라인 WS — 안 깨졌는가
게임이 쓰는 주소는 **절대 경로**라 페이지가 어느 폴더로 옮겨져도 그대로다.
```js
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/game/ws';
```
`/game/ws` 는 터널이 5002로 보낸다. 실제로 붙여 봤다 — **같은 출처**(`/game/` 아래)에
임시 확인 페이지를 잠깐 올려 WS를 열었더니 서버 로그에 접속이 찍혔다.
```
2026-09-14 20:26:32 INFO 접속 f2c67a49 (총 1명)
2026-09-14 20:26:32 INFO 종료 f2c67a49 (총 0명)
```
확인 후 임시 페이지는 지웠다 (`/game/_wscheck/` → 404).

> 처음에는 로컬(`127.0.0.1:8094`)에서 `wss://valuetopic.com/game/ws` 로 붙여 봤는데
> **Cloudflare가 다른 출처의 요청을 막아** 서버까지 오지도 않았다. 그래서 같은 출처에서 다시 쟀다.

### 게임 기능 회귀 (옮긴 파일 기준)
| 항목 | 결과 |
| --- | --- |
| 스킬 단위 시험 | **25 / 25 통과** |
| 19-b 수치 시험 (지속시간·속도·무적·확대·귀환) | **20 / 20 통과** |
| 봇전 20판 | 평균 8.06% · **봇 자멸 0회** |
| `node --check` | 통과 (모듈 2,590줄) |
| `getElementById` | 49개 전부 존재 · 누락 0 |
| importmap JSON | 통과 |

### 푸터
```
<a href="/game/">게임</a>     ← 허브로 간다
```

---

## 변경 파일
| 파일 | 변경 |
| --- | --- |
| `land-grab/index.html` | **레포 루트 `index.html` 에서 이동** (내용 변경 없음) |
| `hub/index.html` | 신규 — 게임 선택 허브 |
| `CLAUDE.md` | 바뀐 파일 배치·배포 경로 기록 |
| `docs/24-game-hub.md` | 본 문서 |
| **(프로덕션)** `valuetopic/app.py` | `/game/` 라우트 3개로 재구성 · 백업함 |
| **(프로덕션)** `valuetopic/templates/base.html` | 푸터 라벨 `게임1` → `게임` · 백업함 |
| (레포 밖) `workspace/games/` | 신규 배포 폴더 |

**서버(`server/ws_server.py`)와 터널 설정(`config-valuetopic.yml`)은 안 고쳤다.**

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
node --check <land-grab/index.html 에서 추출한 모듈 스크립트>
python3 -m py_compile app.py

# 배포
W=~/.openclaw-mir/workspace
mkdir -p $W/games/land-grab
cp hub/index.html       $W/games/index.html
cp land-grab/index.html $W/games/land-grab/index.html

# 재기동 (순단 약 0.7초)
cd $W/valuetopic && ./flask_server_off.sh && ./flask_server_on.sh
```

## 문법 검사 결과
- `land-grab/index.html` 모듈 **2,590줄 → `node --check` 통과**
- importmap JSON 파싱 통과 · `getElementById` 49개 전부 존재 · `innerHTML` 0건
- `app.py` **`py_compile` 통과**
- 허브 페이지는 스크립트가 짧고 모듈이 아니라 브라우저 로드로 확인 (카드 3개 정상 렌더)

## 새 커밋 해시
- `7e223d0`

## 되돌리는 법
```bash
cd ~/.openclaw-mir/workspace/valuetopic
cp app.py.bak-20260914-202136 app.py
cp templates/base.html.bak-20260914-202330 templates/base.html
./flask_server_off.sh && ./flask_server_on.sh
```
옛 `workspace/land-grab/` 폴더를 그대로 두었으므로 이것만으로 원래대로 돌아간다.

## 알려진 이슈
1. **허브가 땅따먹기 레포 안에 산다.** 게임이 늘어나면 허브를 따로 떼는 게 맞다.
   지금은 배포 파이프라인이 이 레포 하나뿐이라 여기 두었다.
2. **썸네일이 이모지다.** 이미지 자리는 비워 뒀다.
3. **옛 주소 `/game/` 를 기억하는 사람은 허브를 보게 된다.** 바로 게임으로 보내는
   리다이렉트는 넣지 않았다 — 허브를 만든 목적과 어긋나서다.
4. 14·16·23·19-b 문서의 판단 대기 건은 그대로다.

## 감독 확인 요청
1. **`valuetopic.com/game/` 에서 허브가 뜨고, 땅따먹기 카드를 눌러 정상 실행되는지.**
2. **온라인 대전을 한 번 붙어 봐 주시면** 확실하다. 경로상으로는 안 건드렸고 접속도 확인했다.
3. 푸터 라벨을 `게임1` → `게임` 으로 바꿨다. 다른 이름이 좋으면 말씀 주시라.


---

# 24-B - FPS Builder 추가 (게임 2개)

허브에 **FPS Builder**를 얹었다. 위 구조를 그대로 써서 **`app.py`는 한 줄도 안 고쳤고,
Flask 재기동도 안 했다. 순단 0초다.** `/game/<게임>/` 라우트가 이미 일반화돼 있어
`games/` 아래에 폴더를 만들고 파일만 넣으면 됐다 — 24에서 노린 그대로다.

```
/game/            게임 선택 허브 (카드 2장 + 준비 중 1)
/game/land-grab/  땅따먹기
/game/fps/        FPS Builder
```

## 1. 레포를 합칠지 — 합치지 않기로 했다

| | 합치기 | **따로 두기 (택함)** |
| --- | --- | --- |
| 이력 | 두 레포의 이력이 섞인다 | 각자 유지 |
| 작업 흐름 | `land-grab-game`의 CLAUDE.md 절차가 FPS에도 걸린다 | 각 레포가 자기 방식대로 |
| 원본과의 관계 | `fps-prototype`이 사실상 죽고, 거기서 작업하면 갈라진다 | **원본이 계속 진짜 소스** |
| 배포 | 한 번에 | 스크립트가 받아다 복사 |

**`fps-prototype`은 별도 레포로 두고, 배포할 때만 받아 온다.** 정현님이 그 레포에서
계속 작업하실 수 있고, 여기로 옮기면 그쪽에서 한 작업이 조용히 갈라진다.

대신 **`deploy.sh`** 를 만들어 한 번에 되게 했다.
```bash
cd ~/land-grab-game && ./deploy.sh
#   workspace/games/index.html           ← 이 레포 hub/index.html
#   workspace/games/land-grab/index.html ← 이 레포 land-grab/index.html
#   workspace/games/fps/index.html       ← fps-prototype 레포에서 받아온다
```
`fps-prototype`을 `/tmp/fps-prototype-deploy`에 받아 `origin/HEAD`로 맞춘 뒤 복사한다.
배포한 원본 커밋 해시도 찍어 준다. 이번 배포는 `7aae219` 다.

> **허브는 여전히 `land-grab-game` 안에 산다.** 게임이 셋을 넘어가면 허브를 따로 떼는 게
> 맞다고 본다 (24 알려진 이슈 1번 그대로).

## 2. 서브패스에서 외부 연결이 안 깨지는가 — 안 깨진다

FPS가 쓰는 외부 자원은 **전부 절대 URL**이다. 상대경로 자원이 **0건**이라
어느 폴더 밑에 놓든 그대로 붙는다.
```
https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js
https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js
https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js
https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js
```
실제로 `/game/fps/` 와 같은 경로 모양으로 띄워 확인했다.
```
THREE True · Peer True · firebase True · firebaseDB True
canvas True · webgl True · 경로 /game/fps/ · 오류 없음
```
PeerJS 브로커(`0.peerjs.com:443`)와 STUN도 코드 안에 절대값으로 박혀 있어 경로와 무관하다.

## 3. ⚠ Firebase 점검 — **데이터베이스가 통째로 열려 있다**

지시하신 대로 확인만 하고 **고치지는 않았다.**

`index.html` 3171~3181줄에 설정이 그대로 노출돼 있다.
```
projectId   dmade-52dfd
databaseURL https://dmade-52dfd-default-rtdb.firebaseio.com
apiKey      AIzaSy...  (웹 apiKey는 원래 공개값이라 이것 자체는 문제가 아니다)
```
**문제는 설정 노출이 아니라 데이터베이스 보안 규칙이다.** 인증 없이 최상위를 읽고 쓸 수 있다.

| 확인 | 결과 |
| --- | --- |
| 인증 없이 **읽기** (`GET /.json?shallow=true`) | **200** — `serverReset · players · chat · zombies · hits · zombieHits` 전부 보인다 |
| 인증 없이 **쓰기** (`PUT /_writeprobe….json`) | **200** — 그대로 기록됐다 |

즉 **누구나 주소만 알면** 전 플레이어 위치·채팅을 읽고, 아무 값이나 쓰고,
**기존 데이터를 통째로 지울 수 있다.** 게임이 그 DB를 그대로 믿고 돌기 때문에
방을 망가뜨리는 것도 가능하다.

> 확인용으로 쓴 키(`/_writeprobe_readonlycheck`)는 **바로 지웠다.**
> 삭제 후 조회했더니 `null` 이고, 최상위 키 목록도 원래대로다.

**권고 (지시 주시면 진행)**
1. Firebase 콘솔에서 Realtime Database 규칙을 잠근다. 최소한 최상위 쓰기를 막고
   게임이 쓰는 가지(`players`·`chat`·`zombies`·`hits`·`zombieHits`·`drops`)만 연다.
2. 익명 인증(Anonymous Auth)을 켜고 `auth != null` 조건을 붙인다.
3. 값 모양·크기 제한(`validate`)을 걸어 아무 값이나 못 들어오게 한다.

## 4. 문법 검사

| | 인라인 스크립트 | `node --check` | `getElementById` |
| --- | --- | --- | --- |
| 땅따먹기 | 2,590줄 (모듈) | **통과** | 49개 · 누락 0 |
| FPS Builder | 4,070줄 (일반 스크립트 1블록) | **통과** | 87개 · **누락 1** |

FPS의 누락 1개는 `overlayTitle` 인데, 쓰는 자리가
```js
} else if (document.getElementById('overlayTitle')) {
```
**있는지 먼저 보고 쓰는 코드**라 문제가 아니다. 원래부터 그런 상태였다 (내가 만든 게 아니다).

## 5. 검증

### 실URL (Flask 재기동 없이)
```
/game/            200 ·   4,599 bytes  · 허브
/game/land-grab/  200 · 126,265 bytes  · 땅따먹기
/game/fps/        200 · 213,329 bytes  · FPS
```
셋 다 **배포본과 바이트 일치**.

### 허브 화면
```
제목      : 게임 선택
카드 수   : 3  (땅따먹기 · FPS Builder · 준비 중)
링크      : land-grab/ · fps/ · /
```

### FPS 페이지
```
제목 : FPS Builder · canvas 있음 · 199,388 bytes 렌더 · 콘솔 오류 없음
```

### 땅따먹기 회귀 (경로 이동 후에도)
```
스킬 단위 시험      25 / 25 통과
19-b 수치 시험      20 / 20 통과
봇전 15판          평균 8.35% · 봇 자멸 0회
```

### 온라인 · 푸터
```
/game/ws → 426 (WS 서버가 응답 — 터널 경로 정상)
푸터     → <a href="/game/">게임</a>
```

## 변경 파일 (24-B)
| 파일 | 변경 |
| --- | --- |
| `hub/index.html` | 카드 2장으로 (FPS Builder 추가), 준비 중 자리 2 → 1 |
| `deploy.sh` | 신규 — 허브·땅따먹기·FPS를 한 번에 배포 |
| `docs/24-game-hub.md` | 본 절 추가 |
| (레포 밖) `workspace/games/fps/index.html` | 신규 — fps-prototype `7aae219` |

**`app.py`·`base.html`·터널 설정·WS 서버 전부 안 고쳤다. 재기동 없음. 순단 0초.**

## 알려진 이슈 (24-B)
1. **Firebase DB가 공개 읽기·쓰기 상태다** (위 3절). 제일 급한 건이다.
2. **FPS는 멀티 동작을 실기로 확인 못 했다.** PeerJS 브로커와 Firebase에 붙는 것까지는
   확인했지만, 실제로 두 사람이 같은 방에 들어가는 건 사람이 둘 붙어야 한다.
   *라이브러리 로드·DB 연결까지는 확인됨* 이라고만 적어 둔다.
3. 허브가 땅따먹기 레포 안에 있다 (24 이슈 1번 그대로).

## 감독 확인 요청 (24-B)
1. **`valuetopic.com/game/` 에서 카드 두 장이 보이고 각각 눌러 실행되는지.**
2. **FPS 멀티를 둘이 붙어 확인해 주시면** 좋겠다 (위 이슈 2번).
3. **Firebase 보안 규칙을 잠글지.** 지시 주시면 진행하겠다.

## 24-B 커밋 해시
- `d264568`

---

## 24-C 덧붙임 — 배포 스크립트 안전장치

FPS 지형 작업(2026-09-14) 때 **`fps-prototype` 레포에 푸시가 막혔다.**
토큰이 세분 권한(fine-grained)이라 그 레포가 목록에 없다.

```
remote: Permission to jh82130351/fps-prototype.git denied to jh82130351.
fatal: ... The requested URL returned error: 403
```
`gh api` 로 보면 `push: true` 로 나오지만, 이건 계정 권한이고 **토큰에 그 레포가
안 들어 있으면 git push는 막힌다.** `land-grab-game` 은 목록에 있어서 잘 된다.

그래서 `deploy.sh` 가 `git reset --hard origin/HEAD` 로 origin에 맞추는 부분이
**푸시 못 한 커밋을 조용히 날리고 옛 버전을 배포하는 함정**이 됐다.
로컬이 앞서 있으면 경고를 띄우고 **로컬 것을 배포하도록** 고쳤다.
```
⚠ fps 원본에 아직 안 올라간 커밋이 1개 있다 — origin 대신 로컬 것을 배포한다
fps 원본 커밋: e1140da (미푸시)
```
푸시가 되면 이 경고는 저절로 사라진다.
