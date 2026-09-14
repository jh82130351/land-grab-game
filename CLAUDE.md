# CLAUDE.md — land-grab-game 작업 지침
> 클로드 코드가 **매 세션 시작 시 제일 먼저** 읽는 문서. 아래 절차를 반드시 따른다.

---

## 0. 프로젝트 한 줄 요약
웹 기반 땅따먹기 게임 (단일 HTML, 브라우저 실행). 게임 방식은 기획자(정현) 확정에 따른다.

## 1. 역할
- **정현(기획자)** / **오퍼스(감독관·검증)** : 기획·방향 결정, `docs/` 문서 검토·컨펌
- **클로드 코드(메인 작업자, = 너)** : 서버에서 코딩·파일 관리·커밋·푸시
- **세모(보조)** : 외부에서 파일 이식·간단 코딩

## 2. GitHub
- 레포: https://github.com/jh82130351/land-grab-game
- 브랜치: `main`
- 인증: 서버 `gh` CLI (`gh auth status`로 확인). 푸시는 **너(클로드 코드)만** 담당.
- 메인 작업 위치: `~/land-grab-game`
- 파일 배치 (24 문서에서 바뀜)
  - `land-grab/index.html` — 땅따먹기 본체 (예전 루트 `index.html`). 검사·시험은 전부 이 파일 기준.
  - `hub/index.html` — `/game/` 게임 선택 허브
  - 배포: `land-grab/index.html` → `~/.openclaw-mir/workspace/games/land-grab/index.html`,
          `hub/index.html` → `~/.openclaw-mir/workspace/games/index.html`

---

## 3. 작업 시작 전 — 매번 실행 (코드 작성 전)
```bash
# 레포 없으면 클론
cd ~ && gh repo clone jh82130351/land-grab-game && cd land-grab-game
# 있으면 최신화
cd ~/land-grab-game && git checkout main && git pull origin main
```
그 다음 상태 파악:
```bash
git log --oneline -5   # 최근 커밋
ls -R                  # 파일 구조
```
→ 확인 끝난 뒤에만 작업 시작.

## 4. 작업 종료 시 — 매번 실행
1. **문법 검사 필수** (통과 전 커밋 금지)
   - JS: `node --check <파일>`
   - 단일 HTML 내 `<script>`는 스크립트만 추출해 `node --check`로 검사
2. `docs/`에 diff 문서 작성 (아래 형식)
3. 커밋·푸시
   ```bash
   git add . && git commit -m "작업 요약" && git push origin main
   ```
4. **감독(오퍼스) 컨펌 전까지 다음 단계 진행 금지**

> 문법 에러가 배포되면 그 아래 기능 전체가 죽는다. 검사는 선택이 아니라 필수.

---

## 5. 보고(diff 문서) 형식
- 위치·파일명: `docs/NN-작업명.md` (예: `docs/00-setup.md`, `docs/01-game-skeleton.md`)
- 번호(NN)는 순차 증가.
- 포함 항목:
  ```
  # NN - 작업명
  ## 무엇을 했나 (1~3줄)
  ## 변경 파일 목록
  ## 실행 명령
  ## 문법 검사 결과 (node --check 통과 여부)
  ## 새 커밋 해시
  ## 감독 확인 요청 사항 / 남은 이슈
  ```

## 6. 검증 루프
```
클로드 코드 작업 → docs/NN-작업명.md 푸시
      ↓
오퍼스 git pull → docs 문서 확인 → 컨펌 or 수정 지시
      ↓
컨펌되면 다음 단계 진행
```

---

## 7. 다음 첫 작업
1. `docs/` 폴더 생성 + 본 `CLAUDE.md` 커밋·푸시 (`docs/00-setup.md`로 보고)
2. 게임 방식 확정 대기 → 확정 후 프로젝트 뼈대(기본 HTML) 셋업
