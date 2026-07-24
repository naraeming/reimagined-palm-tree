import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { toMcpJsonContent, toMcpErrorContent } from "./slack.js";
import { resolveUploadRoots } from "./config.js";
import * as conversations from "./conversations.js";
import * as users from "./users.js";
import * as messages from "./messages.js";
import * as canvas from "./canvas.js";
import * as bookmarks from "./bookmarks.js";
import * as files from "./files.js";
import * as content from "./content-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const UPLOAD_ROOTS = resolveUploadRoots(REPO_ROOT);

const server = new McpServer({ name: "slack-lists", version: "0.1.0" });

function registerJsonTool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      const result = await handler(args);
      return toMcpJsonContent(result);
    } catch (error) {
      return toMcpErrorContent(error);
    }
  });
}

const cellSchema = z
  .object({
    columnId: z.string().optional(),
    column_id: z.string().optional(),
    rowId: z.string().optional(),
    row_id: z.string().optional(),
    kind: z.string().optional(),
    raw: z.record(z.string(), z.unknown()).optional(),
    select: z.array(z.string()).optional(),
    rich_text: z.array(z.unknown()).optional(),
  })
  .passthrough();

// --- 7.6 일반 Slack 읽기 ---

registerJsonTool(
  "slack_auth_test",
  {
    description: "현재 User Token의 사용자·워크스페이스 확인 (auth.test)",
    inputSchema: {},
  },
  () => conversations.authTest()
);

registerJsonTool(
  "slack_list_conversations",
  {
    description: "공개·비공개 채널, DM, 그룹 DM 목록 조회 (conversations.list)",
    inputSchema: {
      types: z
        .array(z.enum(["public_channel", "private_channel", "im", "mpim"]))
        .optional(),
      limit: z.number().int().positive().max(1000).optional(),
      cursor: z.string().optional(),
      excludeArchived: z.boolean().optional(),
    },
  },
  ({ types, limit, cursor, excludeArchived }) =>
    conversations.listConversations({ types, limit, cursor, excludeArchived })
);

registerJsonTool(
  "slack_channel_info",
  {
    description: "채널 이름·주제·멤버십 등 기본 정보 조회 (conversations.info)",
    inputSchema: { channel: z.string() },
  },
  ({ channel }) => conversations.channelInfo({ channel })
);

registerJsonTool(
  "slack_read_channel",
  {
    description: "채널 또는 DM 메시지 조회 (conversations.history)",
    inputSchema: {
      channel: z.string(),
      limit: z.number().int().positive().max(1000).optional(),
      cursor: z.string().optional(),
      oldest: z.string().optional(),
      latest: z.string().optional(),
    },
  },
  ({ channel, limit, cursor, oldest, latest }) =>
    conversations.readChannel({ channel, limit, cursor, oldest, latest })
);

registerJsonTool(
  "slack_read_thread",
  {
    description: "특정 메시지의 스레드 조회 (conversations.replies)",
    inputSchema: {
      channel: z.string(),
      ts: z.string(),
      limit: z.number().int().positive().max(1000).optional(),
      cursor: z.string().optional(),
    },
  },
  ({ channel, ts, limit, cursor }) =>
    conversations.readThread({ channel, ts, limit, cursor })
);

registerJsonTool(
  "slack_search_users",
  {
    description: "사용자 목록을 받은 뒤 이름·표시명·직책을 로컬 필터링 (users.list)",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().positive().max(1000).optional(),
      cursor: z.string().optional(),
      includeInactive: z.boolean().optional(),
    },
  },
  ({ query, limit, cursor, includeInactive }) =>
    users.searchUsers({ query, limit, cursor, includeInactive })
);

// --- 7.5 User Token 메시지 ---

registerJsonTool(
  "slack_send_user_message",
  {
    description: "User Token 소유자 명의로 메시지 전송 (chat.postMessage)",
    inputSchema: {
      channelId: z.string(),
      text: z.string(),
      confirmAsUser: z.literal(true),
      allowMassMention: z.boolean().optional(),
      threadTs: z.string().optional(),
      replyBroadcast: z.boolean().optional(),
      unfurlLinks: z.boolean().optional(),
      unfurlMedia: z.boolean().optional(),
    },
  },
  (args) => messages.sendUserMessage(args)
);

// --- 7.2 캔버스 ---

registerJsonTool(
  "slack_create_canvas",
  {
    description:
      "캔버스 생성. channelId를 주면 채널 탭에도 추가됨 (무료 팀은 channelId 필수) (canvases.create)",
    inputSchema: {
      title: z.string().optional(),
      documentContent: z.record(z.string(), z.unknown()).optional(),
      channelId: z.string().optional(),
    },
  },
  ({ title, documentContent, channelId }) =>
    canvas.createCanvas({ title, documentContent, channelId })
);

registerJsonTool(
  "slack_create_channel_canvas",
  {
    description: "해당 채널의 전용 채널 캔버스 생성 (conversations.canvases.create)",
    inputSchema: {
      channelId: z.string(),
      documentContent: z.record(z.string(), z.unknown()).optional(),
    },
  },
  ({ channelId, documentContent }) =>
    canvas.createChannelCanvas({ channelId, documentContent })
);

registerJsonTool(
  "slack_canvas_info",
  {
    description: "캔버스 메타데이터 조회 (files.info)",
    inputSchema: { canvasId: z.string() },
  },
  ({ canvasId }) => canvas.canvasInfo({ canvasId })
);

registerJsonTool(
  "slack_canvas_sections",
  {
    description: "섹션 ID 검색 (canvases.sections.lookup)",
    inputSchema: {
      canvasId: z.string(),
      criteria: z.record(z.string(), z.unknown()).optional(),
    },
  },
  ({ canvasId, criteria }) => canvas.canvasSections({ canvasId, criteria })
);

registerJsonTool(
  "slack_update_canvas",
  {
    description:
      "캔버스 삽입·교체·이름 변경. 전체 교체는 replaceWholeCanvas=true 필수 (canvases.edit)",
    inputSchema: {
      canvasId: z.string(),
      changes: z.array(z.record(z.string(), z.unknown())),
      replaceWholeCanvas: z.boolean().optional(),
    },
  },
  ({ canvasId, changes, replaceWholeCanvas }) =>
    canvas.updateCanvas({ canvasId, changes, replaceWholeCanvas })
);

// --- 7.4 파일 및 링크 ---

registerJsonTool(
  "slack_list_links",
  {
    description: "채널의 파일 및 링크(링크) 조회 (bookmarks.list)",
    inputSchema: { channelId: z.string() },
  },
  ({ channelId }) => bookmarks.listLinks({ channelId })
);

registerJsonTool(
  "slack_create_link",
  {
    description: "채널에 링크 추가 (bookmarks.add)",
    inputSchema: {
      channelId: z.string(),
      title: z.string(),
      url: z.string().url(),
      emoji: z.string().optional(),
    },
  },
  ({ channelId, title, url, emoji }) =>
    bookmarks.createLink({ channelId, title, url, emoji })
);

registerJsonTool(
  "slack_update_link",
  {
    description: "링크 제목·URL·이모지 수정 (bookmarks.edit)",
    inputSchema: {
      channelId: z.string(),
      bookmarkId: z.string(),
      title: z.string().optional(),
      url: z.string().url().optional(),
      emoji: z.string().optional(),
    },
  },
  ({ channelId, bookmarkId, title, url, emoji }) =>
    bookmarks.updateLink({ channelId, bookmarkId, title, url, emoji })
);

// --- 7.3 파일 ---

registerJsonTool(
  "slack_file_info",
  {
    description: "파일 메타데이터 조회 (files.info)",
    inputSchema: { fileId: z.string() },
  },
  ({ fileId }) => files.fileInfo({ fileId })
);

registerJsonTool(
  "slack_read_file",
  {
    description: "Slack 파일을 text 또는 base64로 읽기 (기본 1MB, 최대 5MB)",
    inputSchema: {
      fileId: z.string(),
      encoding: z.enum(["text", "base64"]).optional(),
      maxBytes: z.number().int().positive().optional(),
    },
  },
  ({ fileId, encoding, maxBytes }) => files.readFile({ fileId, encoding, maxBytes })
);

registerJsonTool(
  "slack_upload_file",
  {
    description:
      "허용된 루트 아래의 로컬 파일만 업로드 (files.getUploadURLExternal + files.completeUploadExternal)",
    inputSchema: {
      localPath: z.string(),
      filename: z.string().optional(),
      channelId: z.string().optional(),
    },
  },
  ({ localPath, filename, channelId }) =>
    files.uploadFile({ localPath, filename, channelId, uploadRoots: UPLOAD_ROOTS })
);

// --- 7.1 리스트 ---

registerJsonTool(
  "slack_list_schema",
  {
    description: "리스트 파일의 컬럼과 옵션 조회 (files.info)",
    inputSchema: { listId: z.string().optional() },
  },
  ({ listId }) => content.listSchema({ listId })
);

registerJsonTool(
  "slack_list_issues",
  {
    description: "항목 목록과 cursor 페이지네이션 (slackLists.items.list)",
    inputSchema: {
      listId: z.string().optional(),
      limit: z.number().int().positive().max(1000).optional(),
      cursor: z.string().optional(),
    },
  },
  ({ listId, limit, cursor }) => content.listIssues({ listId, limit, cursor })
);

registerJsonTool(
  "slack_create_list",
  {
    description: "새 리스트 생성, 할 일 모드, 기존 리스트 복사 (slackLists.create)",
    inputSchema: {
      name: z.string(),
      templateType: z.string().optional(),
      sourceListId: z.string().optional(),
    },
  },
  ({ name, templateType, sourceListId }) =>
    content.createList({ name, templateType, sourceListId })
);

registerJsonTool(
  "slack_create_issue",
  {
    description: "새 항목 생성 (slackLists.items.create)",
    inputSchema: {
      listId: z.string().optional(),
      cells: z.array(cellSchema),
    },
  },
  ({ listId, cells }) => content.createIssue({ listId, cells })
);

registerJsonTool(
  "slack_update_issue",
  {
    description: "기존 항목 수정 (slackLists.items.update)",
    inputSchema: {
      listId: z.string().optional(),
      cells: z.array(cellSchema),
    },
  },
  ({ listId, cells }) => content.updateIssue({ listId, cells })
);

registerJsonTool(
  "slack_complete_issue",
  {
    description:
      "항목 완료 처리. todo_completed 체크박스 또는 select형 상태 컬럼을 스키마로 자동 판별",
    inputSchema: {
      listId: z.string().optional(),
      itemId: z.string(),
      statusColumnId: z.string().optional(),
      doneOptionId: z.string().optional(),
      statusLabel: z.string().optional(),
      doneLabel: z.string().optional(),
    },
  },
  (args) => content.completeIssue(args)
);

const transport = new StdioServerTransport();
await server.connect(transport);
