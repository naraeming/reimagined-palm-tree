# Notion → GitHub → Slack 자동화 셋업 가이드

**완성:** Notion의 마케팅 데이터가 매일 09:00 KST에 자동으로 GitHub에 저장되고 Slack에 알림됩니다.

## 📋 사전 준비물 (1회만)

총 3단계, 약 15분:

### 1단계: Notion Integration 생성 & 공유

**Notion에서:**
1. https://www.notion.so/my-integrations 접속
2. **"새 통합 만들기"** → 이름: `DK-Marketing-Sync` → Create
3. **"Internal Integration Secret"** 토큰 복사 (나중에 필요)
4. Notion "DK 마케팅 한국팀" 루트 페이지 열기
5. **"..." → "Connections" → "Add connection"** → `DK-Marketing-Sync` 선택

✅ 완료: 이제 이 integration이 전체 마케팅 워크스페이스에 접근할 수 있습니다.

### 2단계: Slack 봇 생성 & 초대

**Slack API에서:**
1. https://api.slack.com/apps → **"Create New App"** → "From scratch"
2. 앱 이름: `notion-mirror-bot` → 워크스페이스: DeliveryK
3. 좌측 **"OAuth & Permissions"** → **"Scopes"**에서:
   - `chat:write` 
   - `canvases:write`
   - `channels:read`
   추가
4. **"Install to Workspace"** → **"Bot User OAuth Token"** (`xoxb-...`) 복사

**Slack 앱에서:**
- `#general_marketing` 채널 열기
- **/invite @notion-mirror-bot** 입력 (봇을 채널에 초대)

✅ 완료: 봇이 이제 채널에서 메시지/캔버스를 관리할 수 있습니다.

### 3단계: GitHub Secrets 등록

**GitHub 리포지토리 Settings에서:**
1. **Settings → Secrets and variables → Actions**
2. **"New repository secret"** 버튼, 다음 3개 추가:

| 이름 | 값 |
|---|---|
| `NOTION_TOKEN` | 1단계에서 복사한 Notion token |
| `SLACK_BOT_TOKEN` | 2단계에서 복사한 `xoxb-...` token |
| `NOTION_ROOT_PAGE_ID` | Notion "DK 마케팅 한국팀" 페이지 ID (URL의 맨 뒤) |

**페이지 ID 찾기:**
- Notion에서 "DK 마케팅 한국팀" 열기
- 주소창: `https://www.notion.so/DK-마케팅-한국팀-**f13e1e9f7b55478fb85d04d38e293de7**`
- 마지막 `f13e1e9f...` 부분이 ID

✅ 완료: GitHub Actions가 필요한 자격증명을 모두 가지고 있습니다.

---

## 🚀 작동 확인

### 옵션 1: 로컬 테스트 (권장, 설정 확인용)

```bash
cd tools/notion-github-slack-sync
npm ci

# 환경 변수 설정
export NOTION_TOKEN="(1단계 token)"
export SLACK_BOT_TOKEN="(2단계 token)"
export NOTION_ROOT_PAGE_ID="(3단계 ID)"
export SLACK_CHANNEL_ID="C0BFHPUUMRT"

# Dry-run (실제 commit/Slack 호출 안 함)
node sync.js --dry-run

# 결과:
# - notion-mirror/ 폴더 생성됨 (삭제해도 됨, 테스트 임시용)
# - console에 "would commit/would notify" 로그 출력
```

### 옵션 2: GitHub Actions 수동 실행 (권장)

1. GitHub 리포지토리 → **Actions** 탭
2. **"Notion Mirror Sync"** 워크플로우 선택
3. **"Run workflow"** → **"Run workflow"** 버튼

결과 확인 (몇 분 후):
- ✅ GitHub: 리포지토리에 `notion-mirror/` 폴더 + 파일들 생성
- ✅ Slack: `#general_marketing` 채널에 메시지 + 캔버스 생성

---

## 📅 매일 자동 실행

설정 완료 후부터:
- **매일 09:00 KST** (UTC 00:00)에 자동 실행
- Notion 변경사항 있으면: GitHub 커밋 + Slack 알림 발송
- 변경사항 없으면: 조용히 스킵 (알림 없음)

---

## 📁 생성 구조

실행 후 GitHub 리포지토리:

```
notion-mirror/
  DK-마케팅-한국팀-f13e1e9f/
    _index.md                                    ← 루트 페이지 내용
    성과-유저-분석-a1b2/
      _index.md
      마케팅-데이터-리포트-월간-분기-c3d4/
        _index.md                               ← DB 속성 테이블 (자동 생성)
        rows/
          2026-07-월간-리포트-e5f6.md
          2026-06-월간-리포트-....md
  _manifest.json                                ← 내부용 (ID→경로 매핑)
```

**Slack:**
- 채널 메시지: "오늘 추가 N개, 변경 M개, 삭제 P개 + GitHub 링크"
- 캔버스: "Notion Mirror Index" (모든 페이지 구조 + GitHub 링크)

---

## ⚙️ 자주 묻는 질문

**Q: Notion 제목을 바꾸면?**
A: GitHub에서 파일이 이동(rename)으로 표시됩니다. 중복 생성 안 함.

**Q: GitHub에서 직접 파일을 편집하면?**
A: Notion으로 역동기화되지 않습니다. 모든 변경은 Notion에서 하세요.

**Q: "아무 변화 없는 날"에는?**
A: 정상 동작입니다. GitHub 커밋, Slack 알림이 모두 생기지 않습니다.

**Q: 로그는 어디서 보나요?**
A: GitHub Actions → "Notion Mirror Sync" 워크플로우 → 최신 실행 선택

**Q: "NOTION_TOKEN not found" 오류**
A: GitHub Secrets에 `NOTION_TOKEN`이 등록되어 있는지 확인

**Q: "not_in_channel" Slack 오류**
A: 봇이 `#general_marketing`에 초대되지 않았을 수 있음. `/invite @notion-mirror-bot` 실행

---

## 📖 더 알아보기

자세한 내용은 [`tools/notion-github-slack-sync/RUNBOOK.md`](tools/notion-github-slack-sync/RUNBOOK.md) 참고:
- 아키텍처 상세 설명
- 문제 해결 팁
- 향후 개선 사항
