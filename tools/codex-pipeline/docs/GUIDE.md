# Claude ↔ Codex 적대적 교차검증 가이드

> **문서 분류**: DeliveryK 사내용  
> **대상**: Windows PC에서 VS Code · Claude Code · Codex를 사용하는 직원  
> **목적**: AI 산출물을 다른 AI가 근거 기반으로 반박하고, **마지막에 Claude가 타당성을 재검토**한 뒤 사람이 최종 결정하는 절차를 표준화한다.  
> **주의**: 이 절차는 법무·세무·보안·재무·개인정보 담당자의 전문 검토를 대체하지 않는다.

---

# Part 1. 적대적 교차검증 방법론

## 1. 왜 하는가

단일 AI 산출물에는 사실 오류·과장·누락·잘못된 전제가 섞일 수 있다. 같은 AI가 제 답을 재검토하면 확증편향에 빠진다. **다른 AI가 "틀렸다고 가정하고" 원자료와 대조**하면 오류 발견 가능성이 올라간다.

단, 교차검증도 오류를 완전히 없애지 못한다. 두 AI가 같은 잘못된 자료·전제를 공유하면 같은 결론에 도달할 수 있다. **그래서 마지막 타당성 판단과 최종 결정은 사람이 한다.**

> **핵심 질문**: "이 결론을 믿을 이유"보다 먼저 **"어떤 근거로 이 결론을 깨뜨릴 수 있는가"**를 묻는다.

## 2. ⭐ 표준 파이프라인 — 4단계 (DeliveryK 방식)

| 단계 | 담당 | 하는 일 | 폴더 |
|---|---|---|---|
| **① 초안** | Codex 또는 Claude | 원자료 대조해 초안·산출물 작성 | `0_draft/` |
| **② 적대적 교차검증** | 다른 AI (주로 Codex) | "틀렸다고 가정하고" 반박·오류·누락 적발 (read-only) | `1_review_codex/` |
| **③ 타당성 재검토** | **Claude** | ②의 지적을 **실제 원본과 하나씩 대조해 채택/기각** + 통합본 작성 | `2_review_claude/` |
| **④ 최종 승인** | **사람(운영자)** | 채택·수정·escalation 결정 | `3_approval/` |

**핵심은 ③이다.** Codex의 지적을 그대로 반영하지 않는다. Claude가 **원본 코드·문서와 대조해 근거 있는 지적만 채택하고, 근거 없는 지적은 기각**한다(AI 맹신 금지 — 검증자도 틀릴 수 있다). ②와 ③이 짝을 이뤄야 교차검증이 완성된다.

> **순차 분담**(Codex 초안 → Claude 검증)과 **적대적 교차검증**(산출물 → 반박)은 배타적이지 않다. 어느 방향(Codex→Claude, Claude→Codex, 사람→AI)이든 **AI의 지적은 확정 판정이 아니라 검토 후보**이며, 반드시 ③ 타당성 재검토를 거친다.

## 3. 언제 교차검증하나

- 되돌리기 어렵거나 파급이 큰 정책·마이그레이션·계약·권한 설계
- 수치·사실 주장이 결론을 좌우하는 문서
- 외부(고객·파트너·직원)에 배포할 문서
- 운영자가 "교차검증 / 적대검증 / 둘이 검증 / 반박" 등을 지시할 때
- 작성자가 근거 부족·낮은 확신을 명시한 작업

**법무·세무·보안·개인정보·재무 항목**은 교차검증 이후에도 담당자 검토가 필요하다.

## 4. 검증 입력 패키지 (요약만 주지 않는다)

- 검증 대상의 정확한 경로 또는 원문
- 기준이 되는 코드·계약·데이터·정책 문서
- 적용 환경과 기준일 / 작성자가 쓴 가정 / 검증 범위와 제외 범위
- 원하는 출력 형식 / 개인정보·기밀 비식별화 여부

작성자의 결론 설명은 검증자를 고정시킬 수 있으니, 가능하면 원자료를 먼저 검토하게 한다. 단 필요한 사실·제약까지 숨기지 않는다.

## 5. 적대검증 프롬프트 규칙

1. 문서가 **틀렸다고 가정**하고 반례를 찾는다.
2. **원자료를 직접 읽고** 문서와 대조한다.
3. 경로·명령·필드명·수치·에러 메시지는 **문자열 단위**로 확인한다.
4. **확인된 오류 / 확인 필요 / 근거 부족 기각**을 구분한다.
5. 지적마다 **근거 위치와 영향도**를 제시한다.
6. 보안·개인정보·재현 가능성도 본다.
7. **파일·외부 시스템을 수정하지 않는다** (Codex 항상 `-s read-only`).
8. 마지막에 **반박하지 못한 부분**도 구분해 적는다.

## 6. 판정 기준 (③ 타당성 재검토)

**지적 수가 아니라 근거와 위험으로 판단한다.** (반박 10개보다 근거 있는 치명 1개가 중요)

| 판정 | 기준 |
|---|---|
| **확인된 오류** | 원문·코드·재현으로 불일치 확인됨 → **채택** |
| **확인 필요** | 합리적 의심 있으나 자료·권한 부족 → **보류·에스컬레이션** |
| **기각** | 근거 없거나 원문과 안 맞음 → **로그만 남김** |

| 심각도 | 기준 |
|---|---|
| **높음** | 실행 실패·데이터 손상·보안 사고·잘못된 의사결정 |
| **중간** | 직원 혼란·재작업·부분 실패·기준 불일치 |
| **낮음** | 표현·가독성·경미한 유지보수 |

> ⚠️ **"불확실하면 무조건 문제 있음"으로 몰지 않는다.** 확정 오류와 확인 필요를 분리해야 거짓 양성이 줄고, 반박을 많이 내는 AI를 우수한 검증자로 오판하지 않는다.

## 7. 종료 조건 (무한 반박 방지)

1. 검증자 **1회 반박** → 2. 작성자(Claude)가 근거 대조해 채택·기각 의견 → 3. 높은 위험·의견 불일치 항목만 **사람이 판정** → 4. **새 근거 없으면 AI 간 추가 반박 중단.**

**최종 결정권은 사람.** 필요 시 분야 담당자에게 escalation.

## 8. 기록 및 보안 원칙

- 채택한 지적은 근거와 함께 최종 문서·커밋에 반영.
- 기각한 중요 지적은 "X 지적했으나 Y 이유로 제외" 한 줄.
- 중간 산출물은 로컬 `runs/` 폴더에만 (git 미추적).
- **중간 산출물·로그에 비밀번호·토큰·개인정보를 남기지 않는다.**
- 민감정보가 있으면 먼저 비식별화하거나 담당자 승인.
- **`read-only`는 파일 변경 제한이지, 외부 AI로의 정보 전송 금지가 아니다.** (아래 §16 보안 참조)

---

# Part 2. 직원 PC 셋업 및 실행 (Windows · VS Code · PowerShell)

## 9. 지원 환경 / 전제조건

전원 Windows. VS Code에 Claude Code 사용 중. 이제 **Codex(ChatGPT) 확장을 추가 설치**함. 교차검증은 **Claude Code 세션에서 PowerShell로 `codex-draft.ps1`을 호출**해 Codex를 read-only 보조로 부르는 방식이다.

하나라도 없으면 동작 안 함:
1. VS Code + Claude Code
2. **ChatGPT/Codex VS Code 확장** (`openai.chatgpt-*`) 설치
3. 확장에서 **ChatGPT 로그인(auth) 완료**
4. `codex-draft.ps1` 스크립트 확보 (§11)

래퍼는 아래 위치의 codex.exe만 자동 탐색한다:
```
%USERPROFILE%\.vscode\extensions\openai.chatgpt-*\bin\windows-x86_64\codex.exe
```
> **Windows ARM** · **별도 확장 설치 폴더** · **VS Code Remote 환경**은 별도 검증 필요. (탐색은 이름 내림차순 정렬이라 엄밀한 버전 비교는 아님)

## 10. 사전 점검

```powershell
# 1) PowerShell 버전
$PSVersionTable.PSVersion
# 2) 실행 정책 (차단 시 회사/IT 표준 따름)
Get-ExecutionPolicy -List
```

- **한글 Task**: 최신 `codex-draft.ps1`은 래퍼 내부에서 UTF-8을 고정하므로 별도 조치 불필요. (구버전 래퍼를 쓸 때만, 실행 전 같은 창에서 `$OutputEncoding = New-Object System.Text.UTF8Encoding($false)`)
- **실행 정책 차단 시**: 회사 정책이 허용하는 경우에만 현재 창 한정으로 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`. `LocalMachine`을 임의 변경하거나 출처 불명 파일에 `Unblock-File`을 쓰지 않는다.

## 11. 스크립트 확보 (⚠️ 배포 기준은 운영자 지정)

`codex-draft.ps1`은 메신저·이메일 복사본이 아니라 **회사가 지정한 Git 레포 버전**을 쓴다. 운영자가 안내한 레포를 clone/pull 후 경로 확인:

```powershell
$repo   = 'C:\Users\Admin\Documents\reimagined-palm-tree'  # 본인의 실제 레포 경로로 수정
$script = Join-Path $repo 'tools\codex-pipeline\scripts\codex-draft.ps1'
Test-Path -LiteralPath $repo      # True 여야 함
Test-Path -LiteralPath $script    # True 여야 함
```

레포 안에서 터미널을 열었다면: 
```powershell
$repo = (git rev-parse --show-toplevel).Trim()
```

## 12. 작업 폴더 만들기 (표준 컨벤션 0/1/2/3)

```
tools/codex-pipeline/runs/<작업이름>_<YYYYMMDD_HHMMSS>/
  ├─ 0_draft/          # ① 초안 + 지시서(_task.md)
  ├─ 1_review_codex/   # ② Codex 적대검증
  ├─ 2_review_claude/  # ③ Claude 타당성 재검토·통합
  └─ 3_approval/       # ④ 사람 승인
```

```powershell
$stamp    = Get-Date -Format 'yyyyMMdd_HHmmss'
$run      = Join-Path $repo "tools\codex-pipeline\runs\my_review_$stamp"
$draftDir = Join-Path $run '0_draft'
New-Item -ItemType Directory -Path $draftDir -Force | Out-Null
```

> 이 폴더는 `.gitignore` 대상. 단 `-Out`을 다른 위치로 지정하면 git에 포함될 수 있으니 주의.

## 13. Task 작성

```powershell
# 긴 지시는 파일로 (권장)
$taskFile = Join-Path $draftDir '_task.md'
@'
## 검증 대상
- 파일: src/auth.py
- 코드 라인: 45-67

## 지시
보안 관점에서 이 인증 로직을 검토하세요.
1. 입력 검증이 충분한가?
2. 토큰 저장 방식에 문제는 없는가?
3. 재현 가능한 오류가 있는가?

## 범위
- 코드 오류·보안만 (성능은 제외)
- 테스트 코드는 검토 안 함
'@ | Set-Content -LiteralPath $taskFile -Encoding UTF8
```

> **Task에 포함 금지**: 비밀번호·API 토큰·고객 개인정보·인사정보·불필요한 계약 원문

## 14. 실행

```powershell
$out = Join-Path $run '1_review_codex\codex_review.md'
& $script -Task $taskFile -Repo $repo -Out $out
```

래퍼가 실제 실행하는 핵심: 
```
codex exec -s read-only --skip-git-repo-check -C <Repo> -o <Out>
```

**정상 동작인 파일 생성**(모순 아님): 최종 응답 파일 `$out`, 라이브 로그(`.live.log`), 없으면 상위 폴더.

기본값:
- `-Repo` 미지정 → `C:\Mywork`
- `-Out` 미지정 → `%TEMP%\claude\C--Mywork\codex_drafts\codex_draft_<타임스탬프>.md`

## 15. 진행 확인 · 성공 확인

```powershell
# 라이브 로그: 확장자를 .live.log로 "바꾼" 경로
$live = [System.IO.Path]::ChangeExtension($out, '.live.log')
Get-Content -LiteralPath $live -Wait -Tail 20      # 멈추려면 Ctrl+C
```

> 예: `codex_review.md` → `codex_review.live.log`. `.live.log`는 **stdout 중심**이라 stderr 오류는 실행 터미널에만 보일 수 있음.

성공 시:
```powershell
Test-Path -LiteralPath $out                        # True
Get-Content -LiteralPath $out -Raw -Encoding UTF8   # 내용 확인
```

## 16. 실제 오류 메시지 · 대응

| 실제 메시지(요지) | 원인 후보 | 대응 |
|---|---|---|
| `codex.exe not found ... (searched: ...openai.chatgpt-*)` | 확장 미설치/위치 상이 | ChatGPT/Codex 확장 설치·경로 확인 |
| `[codex-draft] Codex exec failed (exit N). If auth expired, re-login...` | 모든 비정상 종료 공통 (로그인 만료·잘못된 -Repo·권한·네트워크 등) | 실행 터미널의 앞선 stderr부터 확인 → 로그인 → 네트워크 → 경로/권한 |
| `[codex-draft] Draft file was not created: <Out>` | 출력 경로·권한·보안차단 | `-Out` 경로·디스크 권한 확인 |
| `.ps1` 실행 차단 | 실행 정책 | `Get-ExecutionPolicy -List` → 회사 표준 따름 |
| 한글 깨짐 | 구버전 래퍼/인코딩 | 최신 래퍼 사용, `-Encoding utf8` |

## 17. 보안 체크리스트

**⚠️ 중요:** `read-only`는 파일 변경만 막는다. Codex는 검증을 위해 **작업영역(-Repo) 문서를 읽어 모델 요청에 포함**한다. `-Repo`를 레포 루트로 통째 주면 컨텍스트 문서(자격증명 포함 가능)까지 전송될 수 있다. → **허용 데이터 등급·범위 제한은 운영자 정책을 따른다.**

**실행 전:**
- [ ] Task에 비번·토큰·개인정보 없음
- [ ] 불필요한 민감 문서를 작업영역에서 제외
- [ ] `-Out`이 로컬 `runs/` 폴더
- [ ] 결과가 git에 자동 포함 안 됨

**실행 후:**
- [ ] 응답·`.live.log`에 민감정보 재출력 없음
- [ ] AI 지적을 원본과 대조(③)
- [ ] 높은 위험은 사람 확인
- [ ] 채택·기각 근거 반영

---

## (부록) 확정 대기 항목 — 운영자/IT

- 직원 배포용 **레포·브랜치**와 업데이트 절차
- **실행 정책 표준** (Process Bypass / CurrentUser RemoteSigned / 서명 배포 중)
- Codex 허용 **데이터 등급**과 레포 내 **자격증명 분리·비식별화** 기준 (§17 보안)

---

**최종 수정**: 2026-07-24  
**담당**: DeliveryK 마케팅팀
