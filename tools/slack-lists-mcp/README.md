# slack-lists MCP

DeliveryK 직원용 로컬 Slack User Token MCP. Slack 리스트·캔버스·파일·파일 및 링크(링크)·User Token 메시지와
일반 Slack 읽기(인증 확인, 채널·DM 목록, 채널 메시지, 스레드, 사용자 조회)를 제공한다.

## 설치

```powershell
npm install
npm run check
npm test
```

## 토큰 저장

토큰은 채팅이나 파일이 아니라 로컬 터미널에서 직접 저장한다.

```powershell
npm run save-token
```

`xoxp-`로 시작하는 User OAuth Token을 붙여넣으면 Windows Credential Manager
(`service=deliveryk-slack-lists-mcp`)에만 저장된다.

## 환경변수 (선택)

- `SLACK_LIST_ID`: 도구 호출 시 `listId`를 생략했을 때 사용할 기본 리스트 ID
- `SLACK_UPLOAD_ROOTS`: 파일 업로드를 허용할 로컬 경로 목록 (세미콜론 구분, Windows 기준)
- `SLACK_LISTS_ACCOUNT`: keyring account를 강제 지정 (기본은 `USER`/`USERNAME`/OS 사용자명)

## MCP 등록

Codex (`%USERPROFILE%\.codex\config.toml`):

```toml
[mcp_servers.slack-lists]
command = "node"
args = ['<이 프로젝트 절대경로>\src\index.js']
startup_timeout_sec = 60.0
```

Claude Code:

```powershell
claude mcp add --transport stdio --scope user slack-lists -- node "<이 프로젝트 절대경로>\src\index.js"
```

## 보안 원칙

- 토큰은 서버 시작 시 로드하지 않고 도구 호출 시 keyring에서 지연 로드한다.
- 오류 메시지에 토큰이나 Authorization header를 포함하지 않는다.
- `slack_send_user_message`는 `confirmAsUser=true`가 없으면 실패하며,
  `@channel`/`@here`/`@everyone` 멘션은 `allowMassMention=true`를 별도로 요구한다.
- `slack_upload_file`은 허용된 루트(`SLACK_UPLOAD_ROOTS` 또는 저장소 루트·`C:\tmp`) 밖의
  파일을 업로드하지 않는다 (`realpath`로 심볼릭 링크 우회 방지).
- `slack_read_file`은 Slack이 발급한 HTTPS 파일 호스트만 다운로드한다.
