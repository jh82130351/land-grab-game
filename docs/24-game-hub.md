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
- (아래 커밋 참조)

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
