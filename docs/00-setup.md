# 00 - 프로젝트 셋업 (작업 지침 등록)

## 무엇을 했나
- 레포 최신화 후 상태 확인 (`main`, 커밋 1개 `4507300 Initial commit`, 파일은 `README.md` 뿐).
- 작업 지침 문서 `CLAUDE.md`를 레포 루트에 저장.
- 보고 문서 폴더 `docs/` 생성 및 본 문서(`docs/00-setup.md`) 작성.

## 변경 파일 목록
- `CLAUDE.md` (신규)
- `docs/00-setup.md` (신규)

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
git log --oneline -5
ls -R
mkdir -p docs
git add . && git commit -m "docs: CLAUDE.md 작업 지침 등록 + docs 폴더 생성" && git push origin main
```

## 문법 검사 결과 (node --check 통과 여부)
- 해당 없음 (N/A). 이번 커밋에 JS/HTML 코드 파일 없음. 마크다운 문서만 추가.

## 새 커밋 해시
- `d2b6443`

## 감독 확인 요청 사항 / 남은 이슈
1. `CLAUDE.md` 내용이 전달본 그대로 저장되었는지 확인 부탁.
2. **게임 방식 확정 대기 중.** 다음 항목 결정 필요:
   - 플레이 방식: 턴제 보드형(격자 칸 점령) vs 실시간 조작형(선 그어 영역 확보, paper.io류)
   - 인원: 1인(AI 상대) / 로컬 2인 / 온라인
   - 보드 크기·승리 조건
3. 확정 전까지 코드 작업 진행하지 않음. 확정되면 `index.html` 단일 파일 뼈대부터 셋업 예정.
