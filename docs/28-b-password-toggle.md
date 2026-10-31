# 28-b - 비밀번호 보기 버튼

## 무엇을 했나
/game 로그인·계정 만들기 화면의 비밀번호 칸(로그인 비밀번호 · 가입 비밀번호 · 비밀번호 확인)마다 오른쪽 안쪽에 눈 아이콘 버튼을 넣었다.
누르면 `type="password"` ↔ `"text"`, 아이콘은 눈 ↔ 빗금 친 눈.

## 변경 파일 목록
- `hub/index.html` — CSS(.pw · .eye) + 스크립트(비밀번호 칸을 감싸고 버튼 추가, `setPw` · `hidePasswords`)
- `docs/28-b-password-toggle.md`

## 지시 항목

| 항목 | 구현 |
|---|---|
| 입력칸 오른쪽 안쪽 눈 버튼 | 칸을 `span.pw`(relative)로 감싸고 버튼을 absolute 로 오른쪽 안쪽에, 칸 오른쪽 여백 42px |
| password ↔ text, 아이콘 전환 | 숨김 = 눈, 보임 = 빗금 친 눈 |
| 로그인·계정 만들기 둘 다 | `.auth input[type=password]` 3칸 전부 |
| `type="button"` | 폼 제출 안 됨 |
| aria-label | "비밀번호 보기" / "비밀번호 숨기기" + `aria-pressed` |
| 탭 순서 입력칸 다음 | 버튼이 입력칸 바로 뒤 형제 — 따로 tabindex 없음 |
| 인라인 SVG | 고정 SVG 문자열(외부 이미지·폰트 없음), `aria-hidden` |
| 자동으로 다시 숨김 | 로그인·가입 시도(submit) · 화면 전환(로그인 ↔ 계정 만들기 ↔ 게임 목록) · 페이지 떠날 때(`pagehide`) |

## 검증 (헤드리스 크롬, 로컬 시험 서버)

| 확인 | 결과 |
|---|---|
| 버튼 3개 · `type=button` · SVG · 외부 이미지 없음 · 입력칸 바로 뒤 | 3/3 |
| 처음 | 3칸 모두 password · "비밀번호 보기" · pressed false · 눈 |
| 로그인 칸 버튼 클릭 | text · "비밀번호 숨기기" · pressed true · 빗금 |
| 클릭해도 제출 안 됨 | fetch 0회 · 폼 그대로 · 입력값 그대로 |
| 다시 클릭 | password 로 복귀 |
| 실제 Tab 키 (아이디 칸에서) | 비밀번호 → **눈 버튼** → 로그인 버튼 |
| 보이게 한 뒤 로그인 시도 | 즉시 password |
| 가입 두 칸 보이게 → 로그인 화면으로 전환 | 3칸 모두 password |
| 보이게 한 뒤 `pagehide` | password |
| 보이게 한 뒤 가입 시도 | password |
| 화면 | 로그인·계정 만들기 스크린샷 — 칸 오른쪽 안쪽에 아이콘 |

## 실행 명령
```
BR_SRC=~/battle-royale ./deploy.sh      # 허브 파일만 바뀜 — Flask 재기동 불필요
```

## 문법 검사 결과
허브 스크립트 추출 `node --check` 통과.

## 새 커밋 해시
cc9cad8 — feat(28-b) 본 커밋

## 감독 확인 요청 사항 / 남은 이슈
- 실브라우저(정현): 아이콘 크기·위치 체감, 브라우저 자체 비밀번호 보기 아이콘(Edge 등)과 겹치는지.
