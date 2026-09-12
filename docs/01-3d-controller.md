# 01 - 3D 평지 + 1인칭 캐릭터 컨트롤러

## 무엇을 했나
- Three.js(r160, CDN importmap) 기반 **단일 `index.html`** 로 3D 평지 월드와 1인칭 이동을 구현했다.
- WASD 이동·Shift 달리기·Space 점프·마우스 시점(Pointer Lock)·시작 오버레이까지 이번 범위 전부 포함.
- 궤적·점령·죽음·봇·아이템은 지시대로 **넣지 않았다.**

---

## 변경 파일 목록
| 파일 | 변경 |
| --- | --- |
| `index.html` | **신규** — 게임 본체 272줄 (HTML+CSS+module script 단일 파일) |
| `public/index.html` | **삭제** — Hello World 임시 페이지. 루트 `index.html`이 배포 원본이 됨 |
| `docs/01-3d-controller.md` | 신규, 본 문서 |
| `workspace/land-grab/index.html` | (레포 밖) 배포본 갱신 — valuetopic `/game/` 이 이 파일을 서빙 |

### 구현 내용
- **렌더링**: `WebGLRenderer`(antialias, pixelRatio 최대 2) + `Scene` + `PerspectiveCamera(75°)`
  + `requestAnimationFrame` 루프. delta는 **0.05초로 클램프** — 탭 전환 후 복귀 시 순간이동 방지.
- **월드**: 400m × 400m `PlaneGeometry` + 캔버스로 만든 체커 텍스처(4m 타일, 반복·이방성 필터).
  `GridHelper`를 y=0.01에 띄워 z-파이팅 회피. 안개(`Fog`)로 끝이 자연스럽게 사라진다.
  **모서리 색 기둥 4개** 추가 — 완전 평지에서는 방향감이 사라져서 기준점이 필요했다.
- **조명**: `AmbientLight` 0.55 + `HemisphereLight` 0.45(하늘/땅 색 분리) + `DirectionalLight` 1.0.
- **컨트롤**:
  - 카메라 `rotation.order = 'YXZ'` 로 두고 yaw→pitch 적용. 이 순서가 아니면 롤이 섞여 화면이 기운다.
  - pitch는 ±(π/2 − 0.001) 로 클램프 → 고개가 뒤로 넘어가지 않는다.
  - 이동은 **카메라 yaw 기준** 전방 `(-sin, -cos)` / 우측 `(cos, -sin)` 벡터로 계산. 대각 입력은 정규화해 속도 증가를 막았다.
  - 목표 속도로 수렴시키는 가감속(`ACCEL`) — 공중에서는 절반만 적용해 공중 조작을 제한.
  - 중력 25, 점프 초속 8, 눈높이 1.7m 기준 `y <= EYE` 착지 판정.
  - 평지 경계(±199m) 밖으로 못 나가게 클램프.
- **입력 안정성**: `Space` 기본 스크롤 차단, 창 `blur`·포인터락 해제 시 눌린 키 전부 해제(키 고착 방지).
- **HUD**: 좌표 x·z·높이, 실제 속도(m/s), RUN 표시, fps. 100ms 주기로만 갱신.

---

## 실행 명령
```bash
cd ~/land-grab-game && git checkout main && git pull origin main
# (작성)
python3 -c "..."                 # <script type=module> 블록 추출 → check.mjs
node --check check.mjs           # 문법 검사
cp index.html ~/.openclaw-mir/workspace/land-grab/index.html   # valuetopic 배포
git add . && git commit && git push origin main
```
로컬에서 열려면 파일 직접 열기(`file://`)가 아니라 서버가 필요하다 (module + CDN import 때문):
```bash
cd ~/land-grab-game && python3 -m http.server 8000   # → http://localhost:8000
```

## 문법 검사 결과 (node --check 통과 여부)
- `<script type="module">` 블록 1개, 197줄을 `check.mjs`로 추출 → **`node --check` 통과**.
  (ES module 문법이라 `.js`가 아닌 **`.mjs` 확장자**로 검사해야 `import` 구문이 통과한다.)
- `<script type="importmap">` JSON **파싱 통과**.
- CDN 실검증: `three@0.160.1/build/three.module.js` → **200, 1.27MB, REVISION '160'** 확인.

## 배포 URL
| 경로 | 상태 |
| --- | --- |
| **https://valuetopic.com/game/** | **동작 중** — 배포 완료, `<title>` 교체 확인 (로컬 200 실측) |
| GitHub Pages | **활성화 실패 — 정현님 수동 작업 필요** (아래 참조) |

**GitHub Pages를 켜지 못했다.** `gh api -X POST .../pages` 가
`403 Resource not accessible by personal access token` 로 거부됐다.
서버 `gh` 토큰이 fine-grained PAT이고 **Pages 권한(pages: write)이 없다.**
레포 자체는 PUBLIC, 기본 브랜치 main으로 조건은 갖춰져 있다.

→ 정현님이 직접 켜주셔야 한다:
**Settings → Pages → Source: Deploy from a branch → Branch: `main` / 폴더 `/ (root)` → Save**
켜면 URL은 **https://jh82130351.github.io/land-grab-game/** 이 된다 (활성화 후 1~2분 소요).
토큰에 Pages 권한을 추가해 주시면 다음부터는 내가 직접 처리하겠다.

## 새 커밋 해시
- `fec0806`

## 감독 확인 요청 사항 / 남은 이슈
1. **GitHub Pages 수동 활성화 필요** (위 참조). 토큰 권한 부족이 원인이다.
2. **조작감 수치 컨펌 요청** — 걷기 6 / 달리기 11 / 점프 8 / 중력 25 / 마우스 감도 0.0022.
   실제로 돌려보시고 "빠르다/느리다/무겁다"만 알려주시면 조정하겠다.
3. **모바일 미지원.** Pointer Lock과 키보드 전제라 터치 기기에서는 이동이 안 된다.
   터치 조이스틱이 필요한지 판단 바란다.
4. **게임 방식은 여전히 미확정.** 이번 단계는 방식과 무관한 이동 기반이라 선행 가능했지만,
   02단계(궤적·점령)부터는 턴제/실시간, 인원, 승리 조건이 정해져야 한다.
5. valuetopic 쪽 `app.py`·`base.html` 변경은 아직 버전관리 밖에 있다 (03 문서 1번 이슈, 미해결).
