# 02 - valuetopic.com 연동 사전조사 (조사·보고만, 코드 변경 없음)

## 무엇을 했나
- valuetopic Flask 앱·템플릿·Cloudflare Tunnel 설정을 **읽기 전용**으로 확인하고, land-grab-game을
  서브패스 정적 서빙으로 붙이는 방법과 후보안을 정리했다.
- valuetopic 쪽 파일은 **일절 수정하지 않았다.** 본 문서만 land-grab-game 레포에 커밋.
- 문서 번호: `01`은 결번(게임 방식 미확정으로 뼈대 작업 미착수). 지시대로 `02`로 작성.

---

## ⚠️ 가장 중요한 발견 — `/game/` 경로는 이미 사용 중

`/game/`은 **기존 3D 게임("휴식")이 이미 점유**하고 있다. 신규로 만드는 경로가 아니다.

| 근거 | 위치 |
| --- | --- |
| `GAME_DIR = os.path.join(WS_ROOT, 'game')` | `valuetopic/app.py:34` |
| `@app.route('/game/')` → `game/index.html` 반환 | `valuetopic/app.py:1278-1281` |
| `@app.route('/game/<path:fn>')` **캐치올** 정적 서빙 | `valuetopic/app.py:1284-1287` |
| `/game/api/maps`, `/game/api/map/<map_id>` (GET/POST), `/game/editor/` | `valuetopic/app.py:1298-1364` |
| 실제 파일: Babylon.js 1인칭 게임 + 맵 에디터 + `stage.db` | `~/.openclaw-mir/workspace/game/` |
| **푸터에 이미 `/game/` 링크가 있음** (라벨 `/휴식/`) | `templates/base.html:34` |

실제 응답 확인 (로컬 `127.0.0.1:5001`):

```
/                          200
/game/                     200
/game/static/css/game.css  200   ← 중첩 경로도 캐치올로 서빙됨
/game/editor/js/api.js     200
/game/land-grab/           404   ← 아직 없음
/game1/                    404   ← 비어 있는 경로
```

→ **land-grab-game은 `/game/`을 쓸 수 없다.** 별도 경로가 필요하고, 푸터 '게임1' 링크는
기존 `/휴식/` 링크 **옆에 추가**되는 형태가 된다.

---

## 1. Flask 앱 라우트 구조 & 삽입 지점

### 1-1. 앱 기본 구조
- 파일: `~/.openclaw-mir/workspace/valuetopic/app.py` (1368줄, 단일 파일)
- 앱 생성: `app = Flask(__name__)` — **`app.py:70`**. `static_folder` / `static_url_path` 커스텀 **없음**
  → 기본값 그대로: `valuetopic/static/` 폴더가 `/static/` 으로 서빙됨 (`/static/site.css` 200 확인).
- 기동: `python3 app.py` → `app.run(host='127.0.0.1', port=5001)` (`app.py:1367-1368`)
- 기동/종료 스크립트: `flask_server_on.sh` / `flask_server_off.sh` (멱등 기동, PID 파일 `flask_server.pid`)
- 현재 상태: **가동 중** (PID 2779953, `127.0.0.1:5001` LISTEN)
- 버전: Flask 3.1.3 / Werkzeug 3.1.8

### 1-2. 정적 서빙 패턴 (기존 게임이 쓰는 방식 그대로 재사용 가능)
`app.py:1278-1287`의 2줄짜리 패턴이 그대로 본보기다.

```python
GAME_DIR = os.path.join(WS_ROOT, 'game')          # app.py:34

@app.route('/game/')
def game_index():
    return send_from_directory(GAME_DIR, 'index.html')

@app.route('/game/<path:fn>')
def game_static(fn):
    return send_from_directory(GAME_DIR, fn)
```

land-grab용으로 추가한다면 **같은 모양으로 경로 상수 1개 + 라우트 2개**면 끝난다.
`send_from_directory`는 이미 `app.py:19`에서 import 되어 있어 import 추가도 불필요.

**추가 위치 제안:** `app.py` 맨 끝, `game_editor_index()` (1361-1364줄) **바로 아래**,
`if __name__ == '__main__':` (1367줄) **위**. 기존 게임 블록과 인접해 관리가 쉽다.

### 1-3. 푸터 '게임1' 링크 삽입 지점
- 파일: `templates/base.html` (41줄, 모든 페이지가 상속)
- 푸터: **29-38줄**, 링크 목록은 **`<nav>` 30-36줄**

```html
29  <footer class="ftr">
30    <nav>
31      <a href="/">홈</a>
32      <a href="/terms">이용약관</a>
33      <a href="/privacy">개인정보처리방침</a>
34      <a href="/game/">/휴식/</a>          ← 기존 3D 게임 링크
35      <a class="note" href="/_sec_" ...>   ← 개발노트 아이콘
36    </nav>
```

→ **34줄과 35줄 사이에 한 줄 추가**가 정확한 삽입 지점.
`<a class="note">`(아이콘)는 항상 맨 끝이어야 자연스러우므로 그 앞에 넣는다.

```html
<a href="/game1/">게임1</a>
```

스타일은 손댈 필요 없음. `.ftr nav{display:flex;gap:20px}` (`static/site.css:89`)가
자식 `<a>`를 자동 배치한다. 모바일도 `gap:16px`로 대응됨 (`site.css:116`).

---

## 2. 정적 파일 배치 후보 (3안)

전제: 게임은 순수 정적 HTML/JS (봇전까지 서버 불필요), 레포 원본은 `~/land-grab-game`.

### 안 A — workspace/game/ 하위에 배치 (**코드 변경 0줄**)
`~/.openclaw-mir/workspace/game/land-grab/` 에 파일을 두면
기존 캐치올 `/game/<path:fn>`이 **이미** 서빙한다. 중첩 경로 200 확인됨.
- URL: `https://valuetopic.com/game/land-grab/index.html`
- 장점: app.py 수정·서버 재기동 **전혀 불필요**. 즉시 배포.
- 단점:
  - `/game/land-grab/` (끝 슬래시, 파일명 없음)은 **404**다. 디렉터리 인덱스가 없어서
    푸터 링크를 `.../index.html` 까지 써야 한다. 보기 안 좋음.
  - 남의 게임 폴더 안에 얹히는 구조 → 소유권이 섞인다.
  - `/game/api/*` 네임스페이스가 기존 게임 것이라 나중에 충돌 위험.
- 평가: 임시 확인용으로는 최고, 정식 연동으로는 부적합.

### 안 B — 독립 경로 `/game1/` + 라우트 2개 추가 (**추천**)
`~/.openclaw-mir/workspace/game1/` (또는 `games/land-grab/`)에 정적 파일을 두고
app.py에 상수 1개 + 라우트 2개 추가.
- URL: `https://valuetopic.com/game1/` — 푸터 라벨 '게임1'과 정확히 일치.
- 장점: 경로·폴더·API 네임스페이스가 기존 게임과 완전히 분리. 끝 슬래시 정상 동작.
  향후 `/game1/api/...` 를 자유롭게 쓸 수 있음.
- 단점: app.py 4~8줄 수정 + Flask 재기동 1회 필요 (`flask_server_off.sh && flask_server_on.sh`).
- 평가: **정식 연동안으로 이것을 제안.**

### 안 C — valuetopic/static/ 안에 배치
`valuetopic/static/game1/` 에 두면 기본 static 서빙으로 `/static/game1/index.html` 접근.
- 장점: 라우트 추가 불필요.
- 단점: URL이 `/static/...`으로 지저분함. 푸터 '게임1' 링크로 쓰기에 어색.
  또 `app.py:75-79`의 `after_request`가 `/static/` 전체에 `Cache-Control: no-cache`를 강제 →
  게임 에셋(이미지·JS)이 매번 재검증돼 로딩이 느려진다.
- 평가: 비추천.

### 파일 반영 방식 (위 3안과 직교) — 복사 vs 심볼릭 링크

| 방식 | 장점 | 단점·위험 |
| --- | --- | --- |
| **복사** (`rsync`로 `index.html` 등만) | 공개 대상 파일을 명시적으로 고를 수 있어 안전. workspace 레포에 게임 파일이 섞이지만 추적 가능 | 배포 때마다 복사 단계 필요 (1줄 스크립트로 해결) |
| **심볼릭 링크** (`ln -s ~/land-grab-game ...`) | `git pull` 한 번으로 즉시 반영 | **레포 전체가 웹에 노출된다.** `docs/`, `CLAUDE.md`, `README.md`는 물론 **`.git/` 까지 공개됨 |

**심볼릭 링크 위험은 추정이 아니라 확인된 사실이다.**
`send_from_directory`는 점(`.`)으로 시작하는 파일도 그대로 준다 —
`/game/data/.gitkeep` 요청이 **200**으로 응답했다.
즉 레포 루트를 통째로 링크하면 `.../. git/config` 류가 외부에서 그대로 내려받아진다.
(경로 탈출 자체는 막힌다. `/game/../app.py`, `/game/%2e%2e/app.py` 모두 **404** 확인.)

→ **결론: 심볼릭 링크를 쓴다면 레포 루트가 아니라, 배포 대상만 모은 하위 폴더
(예: 레포 안 `public/`)를 링크해야 한다.** 아니면 복사 방식을 쓴다.
현재 레포에는 `public/`이 없으므로, 뼈대 작업 때 이 구조를 같이 정하는 것을 제안한다.

---

## 3. Cloudflare Tunnel 관점 — **변경 불필요, IP 은닉 그대로 유지**

설정 파일 `~/.cloudflared/config-valuetopic.yml` 전문:

```yaml
tunnel: c469c397-0ff5-47fb-bcad-77f4de1c8f66
credentials-file: /home/jh-happy/.cloudflared/c469c397-0ff5-47fb-bcad-77f4de1c8f66.json

ingress:
  - hostname: valuetopic.com
    service: http://localhost:5001
  - hostname: www.valuetopic.com
    service: http://localhost:5001
  - hostname: news.valuetopic.com
    service: http://localhost:5001
  - service: http_status:404
```

- ingress 규칙이 **hostname 기준만** 있고 `path:` 조건이 하나도 없다.
  → `valuetopic.com`으로 오는 **모든 경로**가 이미 `localhost:5001`로 간다.
  `/game1/`이든 `/game/land-grab/`이든 **터널 설정 수정 불필요.**
- 이는 기존 `/game/`이 이미 같은 구조로 잘 돌아가는 것으로 실증된다.
- IP 은닉: 트래픽이 Cloudflare → 터널 → `localhost:5001`로만 흐르고,
  Flask도 `host='127.0.0.1'`로 바인딩돼 외부에 직접 열린 포트가 없다 (`ss` 확인: `127.0.0.1:5001`만 LISTEN).
  **서브패스 추가는 이 구조를 전혀 건드리지 않는다.**
- 터널 프로세스 가동 중 확인: `cloudflared tunnel --config .../config-valuetopic.yml run valuetopic-tunnel` (PID 3155298)
- 유일한 유의점: 서버에서 볼 수 없는 **Cloudflare 대시보드 쪽 설정**(WAF, 캐시 규칙, Page Rules)이
  경로별로 걸려 있을 가능성. 정현님만 확인 가능하므로 배포 후 실제 URL 1회 확인 권장.

---

## 4. (참고) 향후 온라인 대전 WebSocket 붙일 때

지금은 불필요. 나중을 위한 메모.

**방식 1 — 같은 Flask(5001)에 WS 얹기 (가장 간단)**
- `flask-sock` 등으로 `/game1/ws` 엔드포인트 추가.
- cloudflared는 WebSocket 업그레이드를 기본 지원하고, ingress가 hostname 기준이므로
  **터널 설정 수정 불필요.**
- 단점: 현재 `app.run()`은 개발 서버 단일 프로세스라 동시 접속에 약함.
  실서비스급이면 gunicorn + gevent 등으로 기동 방식 변경 필요.

**방식 2 — 별도 WS 서버(예: 5002)로 분리 + ingress 추가**
- cloudflared ingress는 `hostname` + `path` 조합 매칭을 지원한다. 위에서부터 순서대로 평가되므로
  **더 구체적인 규칙을 앞에** 둬야 한다.

```yaml
ingress:
  - hostname: valuetopic.com
    path: ^/game1/ws         # ← 반드시 아래 포괄 규칙보다 위
    service: http://localhost:5002
  - hostname: valuetopic.com
    service: http://localhost:5001
  ...
```

- 또는 서브도메인 분리(`ws.valuetopic.com` → `localhost:5002`). DNS(CNAME) 등록이 추가로 필요.
- 어느 쪽이든 **cloudflared 재기동이 필요**하고, 재기동 중 사이트가 잠깐 끊긴다.
  설정 파일은 원본 백업 후 수정할 것.

---

## 5. 변경 파일 목록
- `docs/02-valuetopic-integration-plan.md` (신규, 본 문서)
- valuetopic 및 workspace 파일: **변경 없음 (읽기만 수행)**

## 6. 실행 명령 (조사에 사용 — 전부 읽기 전용)
```bash
ls -la /home/jh-happy/.openclaw-mir/workspace/valuetopic/
grep -n "@app.route\|Flask(\|send_from_directory" .../valuetopic/app.py
cat  /home/jh-happy/.openclaw-mir/workspace/valuetopic/templates/base.html
cat  /home/jh-happy/.cloudflared/config-valuetopic.yml
ss -tlnp | grep 5001 ; pgrep -af cloudflared
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/game/...   # 응답코드 확인
```

## 7. 문법 검사 결과 (node --check 통과 여부)
- **해당 없음 (N/A).** 이번 작업은 조사·문서화만으로, JS/HTML 코드 파일 추가·수정이 없다.

## 8. 새 커밋 해시
- `a52355e`

## 9. 감독 확인 요청 사항 / 남은 이슈

**결정이 필요한 것**
1. **경로 확정** — `/game/`은 기존 3D 게임이 점유 중. 대안 중 택 1:
   - `/game1/` (푸터 라벨 '게임1'과 일치, **추천**)
   - `/land-grab/` (게임 이름 그대로, 나중에 게임이 늘면 더 깔끔)
   - `/game/land-grab/index.html` (코드 변경 0, 단 URL이 지저분하고 끝 슬래시 404)
2. **배치 폴더** — `workspace/game1/` vs `workspace/games/land-grab/`.
   게임이 앞으로 더 늘어날 계획이면 후자를 권함.
3. **반영 방식** — 복사 vs 심볼릭 링크. 심볼릭 링크를 쓴다면 레포 안에
   **배포 전용 `public/` 폴더**를 만들고 그것만 링크하는 구조를 권함
   (레포 루트 링크는 `.git/` 노출 위험, 위 2번 항목 참조).
4. **app.py 수정 권한** — app.py와 base.html은 land-grab-game 레포가 아닌 valuetopic(=workspace) 레포 소속이다.
   이번엔 지시대로 손대지 않았다. 실제 연동 단계에서 **내가 수정해도 되는지**,
   아니면 정현님/다른 작업자가 반영할지 정해 주시기 바란다.

**남은 이슈**
- Flask 재기동이 필요한 안(B)을 고르면 사이트가 1~2초 끊긴다. 한산한 시간대 권장.
- Cloudflare 대시보드 측 경로별 규칙은 서버에서 확인 불가. 배포 후 실URL 1회 점검 필요.
- 게임 방식(턴제/실시간, 인원, 보드 크기·승리 조건)은 **여전히 미확정**. 뼈대 작업은 그 확정 후.
