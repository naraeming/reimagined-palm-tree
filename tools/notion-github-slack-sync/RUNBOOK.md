# Notion → GitHub → Slack 매일 동기화 — 실행 RUNBOOK

매일 09:00 KST에 자동으로 "DK 마케팅 한국팀" Notion 워크스페이스 전체를 마크다운으로 GitHub 리포지토리에 미러링하고, 변경사항을 Slack `#general_marketing` 채널에 알립니다.

## 0. 사전 준비 (한 번만 필요)

### 0.1 Notion Integration 생성 및 공유

1. **Notion Integration 생성**
   - https://www.notion.so/my-integrations 접속
   - "새 통합 만들기" 클릭 → 이름 `DK-Marketing-Sync`
   - "Capabilities" → `Read content` 체크 확인
   - "Create integration" 클릭
   - **Internal Integration Secret** 토큰 복사

2. **Notion 페이지에 Integration 공유**
   - Notion 열기 → "DK 마케팅 한국팀" 페이지(루트) 열기
   - "... (더보기)" → "Connections" → "Add connection"
   - 방금 만든 `DK-Marketing-Sync` integration 선택
   - 하위 모든 페이지/데이터베이스가 자동으로 공유됨 ✅

### 0.2 Slack 앱/봇 생성 및 초대

1. **Slack 앱 생성**
   - https://api.slack.com/apps → "Create New App" → "From scratch"
   - 앱 이름: `notion-mirror-bot`
   - 워크스페이스 선택: DeliveryK

2. **Bot 스코프 설정**
   - 좌측 "OAuth & Permissions"
   - "Scopes" → "Bot Token Scopes"
   - 다음 스코프 추가:
     - `chat:write` (메시지 발송)
     - `canvases:write` (캔버스 생성/수정)
     - `channels:read` (채널 정보)

3. **워크스페이스에 앱 설치**
   - "Install to Workspace" 클릭
   - **Bot User OAuth Token** (`xoxb-...`) 복사

4. **봇을 `#general_marketing` 채널에 초대**
   - Slack 앱에서 `#general_marketing` 채널 열기
   - "/invite @notion-mirror-bot" 입력
   - 비공개 채널이므로 **이 단계가 필수**

### 0.3 GitHub Repository Secrets 등록

1. GitHub 리포지토리 → Settings → Secrets and variables → Actions
2. "New repository secret" → 다음 3개 추가:

| Secret 이름 | 값 |
|---|---|
| `NOTION_TOKEN` | 0.1에서 복사한 Notion Integration Secret |
| `SLACK_BOT_TOKEN` | 0.2에서 복사한 Bot User OAuth Token |
| `NOTION_ROOT_PAGE_ID` | "DK 마케팅 한국팀" Notion 페이지의 ID (URL 끝부분) |

예: https://www.notion.so/DK-마케팅-한국팀-`f13e1e9f7b55478fb85d04d38e293de7` → ID는 `f13e1e9f7b55478fb85d04d38e293de7`

`SLACK_CHANNEL_ID`는 기본값 `C0BFHPUUMRT`로 설정되어 있으므로 변경 불필요합니다.

## 1. 로컬에서 테스트하기 (선택)

GitHub Actions 실행 전에 로컬에서 한 번 테스트하고 싶다면:

```bash
cd tools/notion-github-slack-sync
npm ci

# 환경 변수 설정 (0.1~0.3에서 받은 값들)
export NOTION_TOKEN="your-notion-token"
export SLACK_BOT_TOKEN="your-slack-token"
export SLACK_CHANNEL_ID="C0BFHPUUMRT"
export NOTION_ROOT_PAGE_ID="your-page-id"

# Dry-run 모드 (실제 git push/Slack 호출 안 함, 단순 로그만 출력)
node sync.js --dry-run

# 실제 실행 (git commit/push + Slack 알림)
node sync.js
```

## 2. GitHub Actions 자동 실행

### 2.1 스케줄 설정

`.github/workflows/notion-sync.yml`에 다음과 같이 설정되어 있습니다:

```yaml
on:
  schedule:
    - cron: "0 0 * * *"  # 매일 00:00 UTC = 09:00 KST
  workflow_dispatch:      # 수동 실행도 가능
```

### 2.2 수동 실행 (테스트용)

1. GitHub 리포지토리 → "Actions" 탭
2. "Notion Mirror Sync" 워크플로우 선택
3. "Run workflow" → "Run workflow" 버튼 클릭
4. 몇 초 후 실행 시작, 진행 상황 확인

### 2.3 실행 결과 확인

- GitHub: 리포지토리 → `notion-mirror/` 폴더에 파일 생성/수정 확인
- Slack: `#general_marketing` 채널에 메시지 + 캔버스 생성 확인

## 3. 파일 구조

실행 후 생성되는 디렉토리 구조:

```
notion-mirror/
  DK-마케팅-한국팀-<id>/
    _index.md                                      (루트 페이지 본문)
    성과-유저-분석-<id>/
      _index.md
      마케팅-데이터-리포트-월간-분기-<id>/
        _index.md                                  (DB 속성 테이블)
        rows/
          2026-07-월간-리포트-<id>.md
          2026-06-월간-리포트-<id>.md
  _manifest.json                                   (ID ↔ 파일경로 매핑, 내부용)
```

- **`_index.md`**: 페이지/데이터베이스의 본문 내용
- **`rows/*.md`**: 데이터베이스의 각 행(row)
- **`_manifest.json`**: 다음 실행 때 변경사항을 감지하기 위한 메타데이터 (자동 관리)

## 4. 주의사항

### 변경 감지 방식

- Notion에서 **제목을 바꾸면** git에서 `파일 이동` (rename)으로 표시됩니다.
- Notion에서 **내용을 수정하면** git에서 `파일 수정`으로 표시됩니다.
- Notion에서 **페이지를 삭제하면** GitHub의 미러 폴더도 삭제됩니다.

### "아무 변화가 없는 날"

Notion 내용이 변경되지 않으면:
- GitHub: 커밋이 생성되지 않음
- Slack: 메시지/알림이 발송되지 않음
- (조용히 지나감 = 정상 동작)

### 수동으로 GitHub 파일을 편집하면?

미러는 **Notion → GitHub 일방향**입니다. GitHub에서 직접 파일을 편집해도 Notion에 반영되지 않습니다. 모든 변경은 Notion에서 하고, 동기화가 자동으로 반영될 때까지 기다리세요.

## 5. 문제 해결

### "NOTION_TOKEN not found" 오류

- GitHub Secrets에 `NOTION_TOKEN`이 등록되어 있는지 확인
- Notion Integration이 생성되고 "DK 마케팅 한국팀" 페이지에 Connections로 공유되어 있는지 확인

### "Slack API error: not_in_channel" 오류

- 봇이 `#general_marketing` 채널에 초대되어 있는지 확인 (`/invite @notion-mirror-bot`)
- 채널이 비공개인 경우 봇 초대가 필수입니다.

### "No changes detected"

이는 오류가 아닙니다. Notion에 변경사항이 없으면 정상적으로 아무것도 생성하지 않습니다.

### 로그 확인하기

1. GitHub Actions 실행 기록: Settings → Actions → Notion Mirror Sync → 최근 실행
2. 각 step의 상세 로그 확인

## 6. 향후 개선 사항

- [ ] 데이터베이스 row의 첨부파일 자동 다운로드 및 `_assets/` 폴더 관리
- [ ] 임베디드 이미지 로컬 저장 및 상대 경로로 변환
- [ ] PDF/Video 블록 타입 개선
- [ ] 테이블 블록 → Markdown 테이블 자동 변환
- [ ] Slack 캔버스의 부분 업데이트(section-level patching)
