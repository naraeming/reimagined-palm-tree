# 빠른 시작 — 5분 안에 적대검증 실행

> 목표: PowerShell에서 `codex-draft.ps1`을 한 번 실행해보기

---

## 1단계: 확장 설치 (한 번만)

1. **VS Code 열기**
2. **확장 탭** (`Ctrl+Shift+X`)
3. "chatgpt" 또는 "openai" 검색
4. **"ChatGPT"** (OpenAI 공식) 설치 & **로그인**

> **이미 설치됨?** → 2단계로 건너뛰기

---

## 2단계: 작업 폴더 만들기 (PowerShell)

```powershell
# 1) 레포 경로 확인
$repo = 'C:\Users\Admin\Documents\reimagined-palm-tree'
Test-Path $repo  # True여야 함

# 2) 작업 폴더 생성
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$run = Join-Path $repo "tools\codex-pipeline\runs\test_$stamp"
New-Item -ItemType Directory -Path "$run\0_draft" -Force | Out-Null

# 3) 폴더 이동 (선택)
cd $run
```

---

## 3단계: 간단한 Task 작성

```powershell
$taskFile = Join-Path $run '0_draft\_task.md'

@'
## 검증 대상
파일: tools/codex-pipeline/scripts/codex-draft.ps1

## 지시
이 PowerShell 스크립트의 오류와 보안 문제를 찾으세요:
1. 입력 검증이 충분한가?
2. 에러 처리가 있는가?
3. 개인정보를 남기는 부분은 없는가?

## 범위
보안 + 정확성 (성능은 제외)
'@ | Set-Content -LiteralPath $taskFile -Encoding UTF8

Get-Content $taskFile  # 확인
```

---

## 4단계: 실행

```powershell
$script = Join-Path $repo 'tools\codex-pipeline\scripts\codex-draft.ps1'
$out = Join-Path $run '1_review_codex\codex_review.md'

# 실행
& $script -Task $taskFile -Repo $repo -Out $out
```

**기다리세요** (1–3분). 터미널에서:
```
[codex-draft] Searching for Codex executable...
[codex-draft] Found Codex: ...
[codex-draft] Invoking Codex...
...
[codex-draft] done. draft file: C:\Users\Admin\...
```

---

## 5단계: 결과 확인

```powershell
# 파일 존재 확인
Test-Path $out  # True

# 내용 보기
Get-Content $out -Encoding UTF8 | head -30
```

---

## 문제 발생 시

| 증상 | 대응 |
|---|---|
| `codex.exe not found` | VS Code에 ChatGPT 확장 설치 + 로그인 |
| `exit code: 1` | 실행 터미널을 스크롤 올려 빨간 에러 메시지 확인 |
| 한글 깨짐 | `Get-Content $out -Encoding UTF8` 로 다시 읽기 |

---

## 다음 단계

1. **Task 템플릿 복사**  
   `tools/codex-pipeline/templates/_task_template.md` 참고해서 본인 Task 작성

2. **Claude에서 ③ 타당성 재검토**  
   결과 파일(`1_review_codex/codex_review.md`)을 Claude Code에 복사 → 원본과 대조

3. **최종 문서 작성** (`2_review_claude/final_review.md`)  
   Claude의 판정(채택/기각) + 근거 정리

---

**더 자세히:** `tools/codex-pipeline/docs/GUIDE.md` (Part 2 참조)
