# Codex Pipeline: Claude ↔ Codex 적대적 교차검증

DeliveryK 사내 AI 산출물 검증 표준화 시스템

> **목적**: AI 산출물의 오류·누락을 다른 AI가 반박하고, Claude가 원문과 대조해 검증한 뒤 사람이 최종 결정하도록 함

---

## 📋 표준 프로세스

```
① 초안 (Draft)
   ↓
② 적대검증 (Codex Review) ← Codex가 "틀렸다고 가정"하고 반박
   ↓
③ 타당성 재검토 (Claude Review) ← Claude가 원본과 대조해 채택/기각
   ↓
④ 최종 승인 (Human Approval) ← 사람이 결정
```

**핵심 규칙**
- Codex는 **read-only 모드**에서만 실행 (파일 수정 불가)
- Claude는 Codex 지적을 **원문과 대조**해서만 채택 (맹신 금지)
- **최종 결정권은 사람**

---

## 🚀 빠른 시작 (5분)

### 1. 확장 설치

VS Code에 **ChatGPT** (openai.chatgpt-*) 확장 설치 + 로그인

### 2. Task 작성

```powershell
$repo = 'C:\Users\Admin\Documents\reimagined-palm-tree'
$run = Join-Path $repo "tools\codex-pipeline\runs\my_task_$(Get-Date -f yyyyMMdd_HHmmss)"
New-Item -ItemType Directory -Path "$run\0_draft" -Force | Out-Null

# _task.md 작성 (tools/codex-pipeline/templates/_task_template.md 참고)
```

### 3. 실행

```powershell
$script = Join-Path $repo 'tools\codex-pipeline\scripts\codex-draft.ps1'
$out = Join-Path $run '1_review_codex\codex_review.md'

& $script -Task (Join-Path $run '0_draft\_task.md') -Repo $repo -Out $out
```

### 4. Claude에서 검증 (③)

결과 파일을 Claude Code에 붙여넣고 원본과 대조

**자세히:** [`QUICKSTART.md`](QUICKSTART.md)

---

## 📖 문서

| 문서 | 내용 |
|---|---|
| [`GUIDE.md`](docs/GUIDE.md) | **완전판 가이드** (Part 1: 방법론, Part 2: 셋업·실행) |
| [`QUICKSTART.md`](QUICKSTART.md) | 5분 안에 첫 실행 |
| [`templates/_task_template.md`](templates/_task_template.md) | Task 템플릿 (복사해서 사용) |

---

## 📁 폴더 구조

```
tools/codex-pipeline/
├── README.md                      ← 여기
├── QUICKSTART.md                  ← 빠른 시작
├── docs/
│   └── GUIDE.md                   ← 완전 가이드
├── scripts/
│   └── codex-draft.ps1            ← PowerShell 래퍼 스크립트
├── templates/
│   └── _task_template.md          ← Task 작성 템플릿
├── runs/
│   ├── my_review_20260724_153000/
│   │   ├── 0_draft/               ① 초안 & Task
│   │   ├── 1_review_codex/        ② Codex 검증
│   │   ├── 2_review_claude/       ③ Claude 재검토 & 통합
│   │   └── 3_approval/            ④ 최종 승인
│   ├── another_task_20260720_100000/
│   └── ...
└── .gitignore                     ← runs/ 제외
```

> `runs/` 폴더는 **`.gitignore` 대상**이므로 git에 저장되지 않음

---

## 🔑 핵심 개념

### ① 초안 (Draft)
- Codex 또는 Claude가 작성
- 파일 경로: `0_draft/`
- 포함: 원자료, Task 지시서 (_task.md)

### ② 적대검증 (Codex Review)
- **Codex가 실행** (read-only, -s 플래그)
- "이 문서가 틀렸다고 가정하고" 반박·오류 찾기
- 규칙:
  1. 원자료 직접 읽음 (Task 설명은 나중)
  2. 확인된 오류 / 확인 필요 / 근거 부족 분류
  3. 각 지적마다 위치(file:line) & 영향도 명시
  4. 파일 수정 불가
- 결과: `1_review_codex/codex_review.md`

### ③ 타당성 재검토 (Claude Review)
- **Claude가 실행** (Claude Code 세션에서)
- ②의 각 지적을 **원문과 대조해 검증**
- 판정:
  - **채택**: 원문·코드와 불일치 확인 → 최종 문서에 반영
  - **보류**: 합리적 의심 있으나 자료/권한 부족 → escalation
  - **기각**: 근거 없음 또는 원문과 일치 → 로그만 남김
- 결과: `2_review_claude/final_review.md` (근거 & 판정 포함)

### ④ 최종 승인 (Human Approval)
- 운영자/담당자가 ③의 판정 검토
- 필요 시 escalation (법무·보안·개인정보)
- 결과: `3_approval/approved.md` (최종 체크리스트)

---

## 🛡️ 보안 주의사항

**`read-only`는 파일 변경만 막는다.** Codex는 Task·원자료를 **모델 요청에 포함**하므로:

- **Task에 포함 금지**: 비밀번호, API 토큰, 개인정보, 고객명 등
- **민감 문서**: 미리 비식별화 또는 담당자 승인
- **-Repo 범위**: 꼭 필요한 파일만 포함 (전체 레포 X)

**실행 전 체크**:
- [ ] Task에 민감정보 없음
- [ ] 민감 파일을 `-Repo`에서 제외
- [ ] `-Out`이 로컬 `runs/` 폴더

**실행 후 체크**:
- [ ] 응답 파일에 민감정보 재출력 없음
- [ ] 로그 파일(`.live.log`)도 확인
- [ ] git commit 전에 재확인

---

## ❓ FAQ

**Q. Codex와 Claude 중 누가 먼저 검증해야 하나?**  
A. 둘 다 가능. 초안 작성자가 다르면 (Codex 초안 → Claude 검증), 같으면 (Claude 작성 → Codex 반박 또는 그 반대). 중요한 건 ③에서 원문과 대조.

**Q. AI가 틀릴 수 있으니 의미 있나?**  
A. 맞다. 그래서 ③ 타당성 재검토가 필수. 한 AI의 오류를 다른 AI가 반박하고, 사람이 원문과 대조해 판정. 단일 AI보다 오류율이 낮다.

**Q. Task에 코드 전체를 줘야 하나?**  
A. 아니다. `file:line` 범위만 명시하고 "원자료를 직접 읽으세요"로 충분. Codex가 repo에서 파일을 직접 읽는다.

**Q. "확인 필요"는 뭐하는 건가?**  
A. 합리적 의심 있지만 자료·권한 부족해서 판정 못하는 항목. escalation 대상.

---

## 🔄 워크플로우 예시

### 예: 정책 문서 검증

```
① 초안: 신입 보안 정책 문서 (Claude 작성)
   → tools/codex-pipeline/runs/security_policy_20260724_140000/0_draft/security_policy.md

② Codex 검증: "법무 요구사항 빠지지 않았나? 근거는?"
   → 1_review_codex/codex_review.md
      - 개인정보 수집 동의 문구 누락 발견
      - 회사 내부 기준과 불일치 3곳 발견
      - 외부 용역사 보안 요구 항목 미흡

③ Claude 재검토: 원문(법무 요구사항) 대조
   → 2_review_claude/final_review.md
      - "개인정보 수집 동의": 법무 요구사항 파일 X:Y 확인 → 채택, 문서에 추가
      - "기준 불일치 3곳": 확인해보니 2곳만 실제 불일치 → 2곳만 채택
      - "용역사 보안": 관련 정책 문서 찾을 권한 부족 → 보류, 법무에 escalation

④ 최종: 법무 담당자가 보류 항목 검토 후 승인
   → 3_approval/approved.md
```

---

## 📝 체크리스트 (운영자용)

- [ ] 모든 직원이 이 README를 읽음
- [ ] VS Code + ChatGPT 확장 설치 정책 수립
- [ ] `codex-draft.ps1` 배포 버전 및 업데이트 절차 정의
- [ ] 허용 데이터 등급 정책 수립 (§17 GUIDE.md 참고)
- [ ] PowerShell 실행 정책 표준 결정 (Process / CurrentUser / 서명 배포)
- [ ] 첫 파일럿 실행 (예: 기존 정책 문서 1개)

---

## 🆘 도움말

- **첫 실행**: [`QUICKSTART.md`](QUICKSTART.md)
- **상세 절차**: [`GUIDE.md`](docs/GUIDE.md)
- **Task 작성**: [`templates/_task_template.md`](templates/_task_template.md)
- **스크립트 오류**: 실행 터미널의 stderr 메시지 & `<file>.live.log` 확인

---

**최종 수정**: 2026-07-24  
**버전**: 1.0  
**담당**: DeliveryK 마케팅팀  
**라이선스**: Internal Use Only
