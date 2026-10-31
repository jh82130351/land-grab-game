# 28 - 게임 계정 + 라스트 드롭 홈 화면(캐릭터 꾸미기)

## 무엇을 했나
/game 전용 계정(가입·로그인·로그아웃·30일 유지·게스트)을 만들고, 라스트 드롭 시작 화면을 **홈 화면**(내 캐릭터 3D 미리보기 · 닉네임 ·
[게임 시작] [꾸미기] [로그아웃])으로 바꿨다. 꾸미기는 서버에 저장되고, 낙하·사망 카메라·결과 화면에 내 캐릭터로 나온다.
**운영 app.py 를 고치고 Flask 를 재기동했다 — 순단 약 1초.**

## 0. 먼저 확인한 것 (지시서 0번)

| 확인 | 결과 |
|---|---|
| 사이트에 기존 회원 로그인이 있나 | **있다 — `/_sec_` 비공개 로그인**. `valuetopic/data/account_db/accounts.db`(이메일·비밀번호(werkzeug 해시)·이메일 코드, 역할 admin/investor). 로그인 뒤는 증권 계좌·포지션 모니터(`/_sec_/dashboard`, `/_sec_/monitor`) |
| `profile.html` | `valuetopic/templates/profile.html` — 위 비공개 계정용 |
| `engine/data/account.db` | 매매 엔진의 **증권 계좌** DB (회원 DB 아님) |
| 공개 가입 | 없다 — 계정은 관리자가 등록부에 넣는다 |

**결정: 재사용하지 않고 게임 전용 계정을 따로 만들었다** (지시서는 "있으면 재사용"). 이유:
1. 공개 가입을 열면 모르는 사람이 **투자 모니터 계정 등록부(accounts.db)** 에 들어간다.
2. 그 로그인은 Flask `session` 쿠키(12시간)를 쓴다. 게임의 "30일 유지" 를 같은 쿠키에 걸면 **관리자 세션도 30일**이 된다.
3. 역할(admin/investor) 검사가 이메일 기준이라, 게임 가입과 섞이면 실수 한 번이 권한 문제가 된다.

나중에 사이트 공용 로그인이 필요하면 게임 계정 쪽을 사이트로 넓히는 방향을 권한다(투자 계정은 계속 따로).

## 변경 파일 목록

| 파일 | 내용 |
|---|---|
| `server/game_accounts.py` (새 파일) | Flask Blueprint — `/game/api/register` · `login` · `logout` · `me` · `lastdrop/avatar` |
| `hub/index.html` | /game 첫 진입 = 로그인 화면, [계정 만들기], "로그인 없이 하기", 로그인 뒤 상단 닉네임·로그아웃 |
| `lastdrop/index.html` · `lastdrop/game.js` | 홈 화면 · 꾸미기 · 미리보기 · 낙하 3인칭 · 사망/승리 카메라 · 결과 화면 미리보기 |
| `deploy.sh` | `server/game_accounts.py` → `valuetopic/game_accounts.py` 복사(바뀌었을 때만, 재기동 필요 안내) |
| **운영** `valuetopic/app.py` | Blueprint 등록 9줄 (`if __name__` 바로 위, try/except — 모듈이 깨져도 사이트는 산다) |
| **운영** `~/.local` (python3.12) | `argon2-cffi 25.1.0` 설치 (`pip install --user`) — 운영 파이썬에 argon2·bcrypt 둘 다 없었다 |

## 1. 구조

```
브라우저 ── https://www.valuetopic.com/game/... ── Cloudflare 터널 ── Flask(127.0.0.1:5001, valuetopic/app.py)
   │                                                                      ├ /game/, /game/<게임>/  → games/ 정적 파일 (그대로)
   │  쿠키 vtg_sess (Path=/game)                                           └ /game/api/*            → game_accounts.py (새로)
   │                                                                               └ valuetopic/data/game_accounts/game_accounts.db
   └ /game/ws ── 터널이 Flask 앞에서 5002(ws_server.py)로 — 이번에 안 건드림
```

DB `game_accounts.db` (권한 600, `games/` 밖 — `games/` 아래 두면 /game/ 으로 내려받히므로 절대 옮기지 말 것):

| 테이블 | 열 |
|---|---|
| users | id · username(UNIQUE, 대소문자 무시) · nickname(UNIQUE, 대소문자 무시) · pw_hash(argon2id) · created_ts |
| sessions | token_hash(sha256) · user_id · csrf · created_ts · expires_ts(30일) |
| hits | kind(login_user / login_ip / reg_ip) · key · ts — 실패·가입 횟수 (재기동해도 유지) |
| avatars | user_id · game('lastdrop') · data(JSON) · updated_ts |

### API

| 요청 | 보호 | 응답 |
|---|---|---|
| `POST /game/api/register` `{username, nickname, password, password2}` | JSON 만 · Origin 같은 호스트 · IP 당 1시간 5번 | `{user, csrf}` + 쿠키 |
| `POST /game/api/login` `{username, password}` | JSON 만 · Origin · 아이디/IP 별 10분 5번 실패 잠금 | `{user, csrf}` + 쿠키 / 401 / 429 |
| `POST /game/api/logout` | `X-CSRF-Token` | 세션 삭제 + 쿠키 지움 |
| `GET /game/api/me` | — | `{user:{username,nickname}, csrf}` 또는 `{user:null}` |
| `GET /game/api/lastdrop/avatar` | 로그인 | `{avatar}` 또는 `{avatar:null}` |
| `PUT /game/api/lastdrop/avatar` `{avatar}` | 로그인 · `X-CSRF-Token` · 1KB 이하 · 키 7개 정확히 · 값은 범위 안 정수 | `{avatar}` |

## 2. 보안 항목 체크

| 지시서 항목 | 구현 | 확인 |
|---|---|---|
| 비밀번호 argon2/bcrypt 해시만 | **argon2id** (m=64MiB, t=3, p=4). 없는 아이디도 더미 해시 검증으로 시간 맞춤. 파라미터 바뀌면 로그인 때 다시 해시 | 운영 DB: `$argon2id$v=19$m=65536,t=3,p=4…` 만, DB·WAL 파일에 평문 비번 없음 |
| 쿠키 HttpOnly · Secure · SameSite=Lax | `vtg_sess`, Path=/game, Max-Age 30일 | 실서버 응답 `Secure; HttpOnly; Path=/game; SameSite=Lax; Max-Age=2592000` |
| CSRF | 로그인 상태 변경(로그아웃·꾸미기 저장) = 세션별 `X-CSRF-Token` 헤더 (상수시간 비교). 가입·로그인 = JSON 전용 + Origin 검사(다른 사이트 폼은 JSON 을 못 보내고, 다른 출처 fetch 는 CORS 사전요청에서 막힌다) | 토큰 없음/틀림 403, 폼 전송 415, 다른 Origin 403 |
| 실패 5회/10분 잠금 (아이디·IP) | 둘 다. 잠금 동안 맞는 비번도 429 + 남은 초 | 5번 틀린 뒤 6번째(맞는 비번) 429 "600초 뒤에" |
| 계정 생성 IP 속도 제한 | IP 당 1시간 5번 | 단위 시험 |
| IP | 터널 뒤라 Flask 는 늘 127.0.0.1 — 그때만 `CF-Connecting-IP` 를 믿는다 | — |
| 비밀값 코드·레포 금지 | **secret key 를 쓰지 않는다** — 세션은 랜덤 토큰을 DB 에 해시로. 레포에 비밀값 없음 | — |
| SQL 파라미터 바인딩 | 전부 `?` 바인딩 | 코드 |
| 출력 이스케이프 | API 는 JSON 만. 화면은 `textContent`/`createElement` 만 (닉네임 등) | 코드 |
| 입력 검증 | 아이디 `^[A-Za-z0-9]{4,16}$` · 닉네임 2~12자(꺾쇠·제어문자 거부) · 비번 8~128자 · 요청 4KB/1KB 제한 | 단위 시험 |
| 캐시 | `/game/api/*` 응답 `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` | 실서버 응답 |

## 3. 로그인 흐름

- `/game/` 첫 진입 → 로그인 화면(아이디·비밀번호) · 아래 [계정 만들기] · 작은 "로그인 없이 하기".
- 가입 = 아이디(영문·숫자 4~16) · 닉네임(2~12) · 비밀번호(8자 이상) + 확인. 아이디·닉네임 중복 검사(대소문자 무시).
- 로그인 성공 → 게임 목록, 위에 "로그인: 닉네임 [로그아웃]". 로그인 유지 30일.
- `?next=/game/<게임>/` 이면 로그인 뒤 그 게임으로 (그 모양이 아니면 무시 — 다른 주소로 안 보낸다).
- **게스트**: "로그인 없이 하기" → 이 탭 동안(sessionStorage) 게임 목록·게임 이용, 꾸미기·기록 저장 안 됨. ⚠️ **정현 확인 필요** (아래).
- 계정 서버가 응답하지 않으면 허브는 게임 목록을 그냥 보여 준다(게임을 막지 않는다).

## 4. 라스트 드롭 홈 화면

- `/game/lastdrop/` → `/game/api/me` 확인.
  - 로그인: 홈 = 내 캐릭터 3D 미리보기(천천히 회전, 끌면 돌림) · 닉네임 · [게임 시작] [꾸미기] [로그아웃].
  - 비로그인: "로그인하면 꾸미기와 기록이 저장됩니다" + [로그인 · 계정 만들기](→ `/game/?next=/game/lastdrop/`) + "로그인 없이 하기".
  - 게스트: 홈(닉네임 "게스트", "꾸미기·기록이 저장되지 않는다"), 꾸미기는 되지만 [저장] 은 "이번 접속에서만".
- 꾸미기 (형태·색만, 텍스처 없음):

| 항목 | 프리셋 |
|---|---|
| 피부 | 색 8 |
| 머리 모양 | 짧은 머리 · 긴 머리 · 뾰족 머리 |
| 머리 색 | 색 8 |
| 상의 | 색 8 |
| 하의 | 색 8 |
| 모자 | 없음 · 캡 · 헬멧형 · 비니 |
| 가방 | 색 8 (등의 가방 + 앞 멜빵) |

- [저장] → 서버. 다음 로그인·다른 브라우저에서도 그대로.
- 게임 안 반영:
  - **낙하**(자유낙하·낙하산): 3인칭(카메라 5.5m 뒤)으로 내 캐릭터가 보인다. 자유낙하는 엎드린 자세, 낙하산은 내 낙하산도 보인다. 착지하면 1인칭으로.
  - **사망·승리 카메라**: 결과 화면 전 2.8초(실제 시간) 동안 내 캐릭터(죽으면 쓰러짐)를 중심으로 천천히 돈다.
  - **결과 화면**: 홈과 같은 미리보기 + 순위표 + [다시 한 판].
- 시작 화면 아무 데나 눌러도 시작하던 것은 없앴다 — 꾸미기 버튼과 겹쳐서 [게임 시작] 으로만.

## 5. 검증

### 단위 (Flask 테스트 클라이언트, 임시 DB)
형식 오류 4종 거부 · 폼 전송 415 · 다른 Origin 403 · 가입 성공 + 쿠키 속성 · 중복 아이디(대소문자) 409 · 중복 닉네임 409 ·
CSRF 없음/틀림 403 · 꾸미기 범위 밖/키 추가 400 · 다른 클라이언트 로그인 시 같은 꾸미기 · 5회 실패 뒤 맞는 비번 429 ·
DB 에 argon2id 해시만, 평문 없음, 세션 토큰 sha256(64자), 파일 권한 600 — 전부 통과.

### E2E (헤드리스 크롬 2개 = 다른 브라우저) — 로컬 시험 서버, 그리고 **실서버**

| # | 항목 | 실서버 결과 |
|---|---|---|
| 1 | /game/ 첫 진입 | 로그인 화면, 게임 목록 숨김 |
| 2 | 짧은 비번 | "비밀번호는 8자 이상" |
| 3 | 계정 만들기 | 게임 목록 + "로그인: 테스터 [로그아웃]" |
| 4 | /game/lastdrop/ | 홈 · 닉네임 · [게임 시작] |
| 5~6 | 꾸미기 7항목 바꾸고 저장 | "저장했다" |
| 7 | 로그아웃 | `/game/?next=/game/lastdrop/` 로그인 화면 |
| 8 | 재로그인 | 라스트 드롭으로 돌아오고 **꾸미기 유지** |
| 9 | 다른 브라우저 같은 계정(아이디 대문자로) | **같은 꾸미기** |
| 10 | 비로그인으로 /game/lastdrop/ 직접 | 로그인 안내 + 로그인 링크(next) |
| 11 | "로그인 없이 하기" | 게스트 홈, 저장은 "이번 접속에서만" |
| 12 | 틀린 비번 6회 | (로컬) 5번째까지 "틀렸다", 6번째 "595초 뒤에" · (운영) 127.0.0.1 로 직접 — 6번째와 맞는 비번 모두 429 |
| 13 | 낙하 중 | 3인칭(5.5m), 내 캐릭터 보임 |
| 14 | 착지 후 | 1인칭, 내 캐릭터 숨김 |
| 15 | 죽은 직후 | 결과 화면 전, 3인칭, 쓰러짐(−90°) |
| 16 | 2.8초 뒤 | 결과 화면 + 미리보기 |
| — | 런타임 오류 | 0 |

- 실서버 잠금 시험은 **공개 주소로 하지 않았다** — 이 서버 공인 IP 가 10분 잠기면 같은 네트워크의 정현 로그인도 막힌다. 127.0.0.1:5001 로 직접(IP 키 = 127.0.0.1).
- 시험 계정 `vtqa2610` · `vtqalock1` 과 그 세션·꾸미기·횟수 기록은 **운영 DB 에서 지웠다** (users 0 · sessions 0 · avatars 0 · hits 0).
- 처음 E2E 에서 결과 화면이 안 떴다 — 2.8초를 프레임 dt(최대 0.05초)로 세서 느린 환경에선 몇 배로 늘어났다 → 실제 시간(`performance.now`)으로 바꿨다.

### 기존 게임 회귀 (실서버)
`/game/` · `/game/land-grab/` · `/game/fps/` · `/game/voxelcraft/` · `/game/br/` · `/game/lastdrop/` · `/game/lastdrop/game.js` · `/` 전부 200.
땅따먹기 온라인 `wss://www.valuetopic.com/game/ws` 연결 OK (터널이 5002 로 보내는 경로 — 재기동과 무관). FPS 페이지는 WebSocket 을 쓰지 않는다.
⚠️ 이제 **/game/ 첫 화면이 로그인**이라, 게임 카드를 보려면 로그인하거나 "로그인 없이 하기" 를 눌러야 한다. 각 게임 주소(/game/land-grab/ 등)로 바로 가는 건 그대로 된다.

## 백업 경로 · 순단

| 대상 | 백업 |
|---|---|
| 운영 `app.py` | `valuetopic/app.py.bak-20261031-154737` |
| 투자 계정 DB(안 건드렸지만) `accounts.db` (+ -wal, -shm) | `valuetopic/data/backup-27-20261031-154737/` (권한 700) |
| 허브·라스트 드롭 배포본 | 같은 폴더 `games-index.html` · `lastdrop-index.html` · `lastdrop-game.js` |

되돌리기: `cp valuetopic/app.py.bak-20261031-154737 valuetopic/app.py` → `flask_server_off.sh && flask_server_on.sh`, 그리고 게임 파일은 이전 커밋으로 `deploy.sh`.

- **Flask 재기동 1회 — 순단 약 1.0초** (0.1초 간격 `/health` 폴링 150회 중 실패 8회, 15:48:14 off → 15:48:15 health 200).
- 재기동 뒤 시작 로그에 `[game_accounts] 등록 실패` 없음. 이후 주석만 고친 것(문서 번호)은 재기동하지 않았다.
- Cloudflare 터널 설정·`ws_server.py` 는 건드리지 않았다.

## 실행 명령
```
python3 -m pip install --user --break-system-packages argon2-cffi     # 운영 python3.12 에 1회
python3 -m py_compile server/game_accounts.py ~/.openclaw-mir/workspace/valuetopic/app.py
node --check lastdrop/game.js   (+ hub/index.html 스크립트 추출 검사)
BR_SRC=~/battle-royale ./deploy.sh
~/.openclaw-mir/workspace/valuetopic/flask_server_off.sh && ~/.openclaw-mir/workspace/valuetopic/flask_server_on.sh
```

## 문법 검사 결과
`py_compile` (game_accounts.py · 운영 app.py) 통과 · `node --check` (lastdrop/game.js · 허브 스크립트) 통과 · `bash -n deploy.sh` 통과.

## 새 커밋 해시
(커밋 후 기록)

## 감독 확인 요청 사항 / 남은 이슈
1. **기존 /_sec_ 계정을 재사용하지 않은 결정** (0번) — 확인 부탁.
2. **게스트 허용 여부 (정현)** — 지금은 허브·라스트 드롭 둘 다 "로그인 없이 하기" 가 있고, 게스트는 꾸미기·기록이 저장되지 않는다. 막을지, 둘지.
3. **/game/ 첫 화면이 로그인이 됐다** — 게임 목록을 먼저 보여 주고 로그인을 선택으로 할지.
4. 닉네임도 중복 불가로 했다(나중 온라인 대전에서 구분용). 지시서엔 "중복 검사" 만 있었다.
5. 비밀번호 찾기·변경, 탈퇴, 닉네임 변경은 없다.
6. "기록 저장" 은 아직 없다 — 이번엔 꾸미기만 저장. 순위·전적 저장은 다음 작업.
7. 남들이 보는 내 모습(온라인)은 아직 없다 — 모델(`avatarGeo`)과 저장 형식은 그대로 쓰면 된다.
