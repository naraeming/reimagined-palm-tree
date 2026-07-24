import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { __setTestToken } from "../src/token.js";
import * as content from "../src/content-tools.js";
import * as canvasModule from "../src/canvas.js";
import * as bookmarks from "../src/bookmarks.js";
import * as files from "../src/files.js";
import { installFetchMock, jsonResponse } from "./fetch-mock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_ROOT = path.join(__dirname, "fixtures", "allowed-root");
const OUTSIDE_FILE = path.join(__dirname, "fixtures", "outside-root", "other.txt");
const ALLOWED_FILE = path.join(ALLOWED_ROOT, "sample.txt");

const FAKE_TOKEN = "xoxp-test-token-should-never-leak";

before(() => {
  __setTestToken(FAKE_TOKEN);
});

after(() => {
  __setTestToken(undefined);
});

let mock;

afterEach(() => {
  mock?.restore();
  mock = undefined;
});

test("slack_list_issues forwards list_id and cursor and returns the response cursor", async () => {
  mock = installFetchMock((url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.list_id, "LIST1");
    assert.equal(body.cursor, "cur-1");
    return jsonResponse({
      ok: true,
      items: [{ id: "Rec1" }],
      response_metadata: { next_cursor: "cur-2" },
    });
  });

  const result = await content.listIssues({ listId: "LIST1", cursor: "cur-1" });
  assert.equal(result.response_metadata.next_cursor, "cur-2");
});

test("assignee raw user cell is converted to the Slack cell shape (raw merged, not nested)", () => {
  const cell = content.buildAssigneeCell({
    columnId: "ColAssignee",
    rowId: "Rec1",
    userIds: ["U123"],
  });

  assert.deepEqual(cell, {
    column_id: "ColAssignee",
    row_id: "Rec1",
    user: ["U123"],
  });
});

test("slack_complete_issue uses the todo_completed checkbox path when the schema has a checkbox status column", async () => {
  mock = installFetchMock((url, init) => {
    if (url.includes("files.info")) {
      return jsonResponse({
        ok: true,
        file: {
          list_metadata: {
            schema: [{ id: "Col00", name: "Status", type: "todo_completed" }],
          },
        },
      });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.list_id, "LIST1");
    assert.deepEqual(body.cells, [{ column_id: "Col00", row_id: "Rec1", checkbox: true }]);
    return jsonResponse({ ok: true });
  });

  const result = await content.completeIssue({ listId: "LIST1", itemId: "Rec1" });
  assert.equal(result.ok, true);
});

test("slack_complete_issue uses the select status path when statusColumnId/doneOptionId are given", async () => {
  mock = installFetchMock((url, init) => {
    if (url.includes("files.info")) {
      return jsonResponse({
        ok: true,
        file: {
          list_metadata: {
            schema: [
              {
                id: "ColStatus",
                name: "상태",
                type: "select",
                options: [{ id: "OptDone", label: "완료" }],
              },
            ],
          },
        },
      });
    }
    const body = JSON.parse(init.body);
    assert.deepEqual(body.cells, [{ column_id: "ColStatus", row_id: "Rec1", select: ["OptDone"] }]);
    return jsonResponse({ ok: true });
  });

  await content.completeIssue({
    listId: "LIST1",
    itemId: "Rec1",
    statusColumnId: "ColStatus",
    doneOptionId: "OptDone",
  });
});

test("canvas whole-document replace requires replaceWholeCanvas=true", async () => {
  await assert.rejects(() =>
    canvasModule.updateCanvas({
      canvasId: "F1",
      changes: [{ operation: "replace", document_content: { type: "markdown", markdown: "x" } }],
    })
  );

  mock = installFetchMock(() => jsonResponse({ ok: true }));
  const result = await canvasModule.updateCanvas({
    canvasId: "F1",
    changes: [{ operation: "replace", document_content: { type: "markdown", markdown: "x" } }],
    replaceWholeCanvas: true,
  });
  assert.equal(result.ok, true);
});

test("canvas section-scoped replace does not require replaceWholeCanvas", async () => {
  mock = installFetchMock(() => jsonResponse({ ok: true }));
  const result = await canvasModule.updateCanvas({
    canvasId: "F1",
    changes: [{ operation: "replace", section_id: "S1", document_content: { type: "markdown", markdown: "x" } }],
  });
  assert.equal(result.ok, true);
});

test("bookmarks (파일 및 링크) list/add/edit send the documented request shape", async () => {
  mock = installFetchMock((url, init) => {
    if (url.includes("bookmarks.list")) {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("channel_id"), "C1");
      return jsonResponse({ ok: true, bookmarks: [] });
    }
    if (url.includes("bookmarks.add")) {
      const body = JSON.parse(init.body);
      assert.equal(body.type, "link");
      assert.equal(body.link, "https://example.com");
      return jsonResponse({ ok: true, bookmark: { id: "B1" } });
    }
    if (url.includes("bookmarks.edit")) {
      const body = JSON.parse(init.body);
      assert.equal(body.bookmark_id, "B1");
      assert.equal(body.title, "새 제목");
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected url ${url}`);
  });

  await bookmarks.listLinks({ channelId: "C1" });
  await bookmarks.createLink({ channelId: "C1", title: "링크", url: "https://example.com" });
  await bookmarks.updateLink({ channelId: "C1", bookmarkId: "B1", title: "새 제목" });
});

test("slack_upload_file runs the 3-step external upload flow", async () => {
  const calls = [];
  mock = installFetchMock((url, init) => {
    calls.push(url);
    if (url.includes("files.getUploadURLExternal")) {
      return jsonResponse({ ok: true, upload_url: "https://files.slack.com/upload/abc", file_id: "F999" });
    }
    if (url === "https://files.slack.com/upload/abc") {
      return { ok: true, status: 200, headers: new Map(), json: async () => ({}) };
    }
    if (url.includes("files.completeUploadExternal")) {
      const body = JSON.parse(init.body);
      assert.equal(body.files[0].id, "F999");
      assert.equal(body.channel_id, "C1");
      return jsonResponse({ ok: true, files: [{ id: "F999" }] });
    }
    throw new Error(`unexpected url ${url}`);
  });

  const result = await files.uploadFile({
    localPath: ALLOWED_FILE,
    channelId: "C1",
    uploadRoots: [ALLOWED_ROOT],
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
});

test("slack_upload_file rejects files outside the allowed upload roots", async () => {
  await assert.rejects(() =>
    files.uploadFile({ localPath: OUTSIDE_FILE, uploadRoots: [ALLOWED_ROOT] })
  );
});

test("slack_read_file rejects hosts that are not Slack-issued file hosts", async () => {
  mock = installFetchMock((url) => {
    assert.ok(url.includes("files.info"));
    return jsonResponse({ ok: true, file: { url_private: "https://evil.example.com/leak.txt" } });
  });

  await assert.rejects(() => files.readFile({ fileId: "F1" }));
  assert.equal(mock.calls.length, 1);
});

test("isAllowedSlackFileHost accepts Slack file hosts and rejects everything else", () => {
  assert.equal(files.isAllowedSlackFileHost("https://files.slack.com/files-pri/T1-F1/x.png"), true);
  assert.equal(files.isAllowedSlackFileHost("https://team123.slack.com/files/x.png"), true);
  assert.equal(files.isAllowedSlackFileHost("http://files.slack.com/files-pri/T1-F1/x.png"), false);
  assert.equal(files.isAllowedSlackFileHost("https://evil.example.com/x.png"), false);
});
