# 03 - /game/ 경로 인수 + Hello World 배치

## 무엇을 했나
- valuetopic 푸터의 기존 3D 게임 링크(`/휴식/`)를 끊고, 같은 자리에 **'게임1' 링크**를 넣었다.
- `/game/` 경로가 land-grab-game 쪽을 보도록 Flask 라우트를 재지정하고, 임시 **Hello World** 페이지를 띄웠다.
- 구 3D 게임 **파일은 삭제하지 않았다** (35MB 그대로 보존). 링크와 경로만 넘겨받았다.

---

## 변경 파일 목록

### land-grab-game 레포 (이 레포 — 커밋 대상)
- `public/index.html` (신규) — 배포용 Hello World 페이지. 앞으로 이 폴더가 웹 배포 대상.
- `docs/03-game-path-takeover.md` (신규, 본 문서)

### valuetopic / workspace 레포 (**수정만, 커밋 안 함**)
| 파일 | 변경 |
| --- | --- |
| `valuetopic/templates/base.html` | 34줄 `/휴식/` 링크 삭제 → 같은 자리에 `<a href="/game/">게임1</a>` 추가 |
| `valuetopic/app.py` | 36-37줄 `LANDGRAB_DIR` 상수 추가, 1283·1289줄 서빙 경로를 `GAME_DIR`→`LANDGRAB_DIR`로 교체 |
| `workspace/land-grab/index.html` | 신규 배포 폴더 + 페이지 복사본 |

app.py 실제 diff (3곳뿐):
```diff
@@ 35a36,37
+ # land-grab-game(게임1) 정적 파일 — /game/ 경로는 이 폴더가 사용
+ LANDGRAB_DIR = os.path.join(WS_ROOT, 'land-grab')
@@ 1281c1283  (game_index)
- return send_from_directory(GAME_DIR, 'index.html')
+ return send_from_directory(LANDGRAB_DIR, 'index.html')
@@ 1287c1289  (game_static)
- return send_from_directory(GAME_DIR, fn)
+ return send_from_directory(LANDGRAB_DIR, fn)
```

`GAME_DIR` 상수 자체는 남겨뒀다. `/game/editor/`와 `/game/api/*`가 아직 그것을 참조한다.

---

## 실행 명령
```bash
mkdir -p ~/.openclaw-mir/workspace/land-grab
cp ~/land-grab-game/public/index.html ~/.openclaw-mir/workspace/land-grab/index.html
# app.py / base.html 수정 (백업 후)
python3 -m py_compile ~/.openclaw-mir/workspace/valuetopic/app.py
~/.openclaw-mir/workspace/valuetopic/flask_server_off.sh
~/.openclaw-mir/workspace/valuetopic/flask_server_on.sh
```

## 문법 검사 결과
- `app.py` → `python3 -m py_compile` **통과** (JS가 아니라 파이썬이므로 node --check 대상 아님)
- `public/index.html` → `<script>` 태그 **0개**. JS 없음 → `node --check` 대상 없음.

## 동작 확인 (재기동 후 실측, 127.0.0.1:5001)
```
/                          200
/game/                     200   ← Hello World 정상
/game/ <title>             게임1 — land-grab-game
/game/ <h1>                Hello, World!
홈 푸터 링크               홈 / 이용약관 / 개인정보처리방침 / 게임1   ← /휴식/ 사라짐
```
Flask 재기동 완료 (새 PID 3074239). 터널 설정은 **손대지 않음** — hostname 기준이라 수정 불필요.

## 구 3D 게임 현재 상태
| 항목 | 상태 |
| --- | --- |
| 파일 `workspace/game/` 35MB | **보존** (삭제 안 함) |
| 맵 DB `stage.db`·`account.db` | **보존** |
| 푸터 링크 | 제거됨 |
| `/game/` 메인 | land-grab-game이 가져감 |
| `/game/static/...` 구 자산 | 404 (캐치올이 새 폴더를 보므로) |
| `/game/editor/`, `/game/api/*` | **여전히 200** — 구 게임 것을 그대로 가리킴 |

## 새 커밋 해시
- `ddca999`

## 감독 확인 요청 사항 / 남은 이슈
1. **(처리됨 + 새 문제)** 커밋 지시를 받아 workspace 레포에 `land-grab/index.html`을 커밋했다
   (로컬 커밋 `5b86efe`, **푸시는 안 함** — 원격이 `DnielPark/valuetopic-review`로 정현님 계정이 아님).
   그런데 **`app.py`와 `base.html`은 커밋이 불가능했다.**
   - workspace `.gitignore` 55-56줄에 `# === Nested valuetopic/ (should not be in repo) ===` 주석과 함께
     `valuetopic/` 이 통째로 제외돼 있다. 의도적 배제다.
   - `valuetopic/` 폴더에는 자체 `.git`도 없다. 즉 **app.py는 어떤 버전관리도 받고 있지 않다.**
   - 따라서 이 두 파일의 변경은 디스크에만 존재한다. 누가 덮어쓰면 복구 수단이 없다.
   - `git add -f`로 강제 추가할 수는 있으나, 명시적 배제 정책을 뒤집는 일이라 임의로 하지 않았다.
     (해당 폴더에 `.env`·계정 DB가 있어 배제한 것으로 보인다. 강제 추가 시 비밀정보 유출 위험.)
   → **지시 요청: (a) 그대로 둔다 (b) valuetopic/ 전용 레포를 새로 만든다
     (c) 변경분만 패치 파일로 어딘가 보관한다. 셋 중 택 1.**
   변경 내용 자체는 위 "변경 파일 목록"의 diff 3줄이 전부라 언제든 재적용 가능하다.
2. **`/game/editor/`·`/game/api/*`는 아직 구 게임 것이다.** 링크는 없지만 URL로 접근하면 열린다.
   같이 정리할지(라우트 삭제) 남길지 결정 필요.
3. 백업 위치: `app.py.bak`, `base.html.bak`를 세션 스크래치패드에 보관 중. 되돌리려면 말씀만 하시면 된다.
   구 게임 코드는 원격(origin/main)에 1393개 파일 전부 올라가 있어 복구 가능하다.
4. 게임 방식(턴제/실시간, 인원, 보드 크기·승리 조건)은 여전히 미확정. 확정되면 `public/index.html`을 실제 게임으로 교체한다.
