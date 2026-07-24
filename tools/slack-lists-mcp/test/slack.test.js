import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { __setTestToken } from "../src/token.js";
import { callSlackApi, SlackApiError } from "../src/slack.js";
import * as conversations from "../src/conversations.js";
import * as users from "../src/users.js";
import * as messages from "../src/messages.js";
import { installFetchMock, jsonResponse } from "./fetch-mock.js";

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

test("Authorization header is set but the token never appears in a thrown error", async () => {
  mock = installFetchMock((url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
    return jsonResponse({ ok: false, error: "channel_not_found" });
  });

  await assert.rejects(
    () => callSlackApi({ method: "conversations.info", httpMethod: "GET", params: { channel: "C1" } }),
    (error) => {
      assert.ok(error instanceof SlackApiError);
      assert.equal(error.slackError, "channel_not_found");
      assert.ok(!error.message.includes(FAKE_TOKEN));
      assert.ok(!("Authorization" in error));
      return true;
    }
  );
});

test("Slack ok=false responses are surfaced as SlackApiError with the slack error code", async () => {
  mock = installFetchMock(() => jsonResponse({ ok: false, error: "invalid_auth" }));

  await assert.rejects(
    () => callSlackApi({ method: "auth.test", httpMethod: "POST", params: {} }),
    (error) => {
      assert.equal(error.slackError, "invalid_auth");
      return true;
    }
  );
});

test("missing_scope errors surface needed/provided scopes without leaking the token", async () => {
  mock = installFetchMock(() =>
    jsonResponse(
      { ok: false, error: "missing_scope", needed: "groups:read", provided: "channels:read" },
      { headers: { "x-accepted-oauth-scopes": "groups:read", "x-oauth-scopes": "channels:read" } }
    )
  );

  await assert.rejects(
    () => callSlackApi({ method: "conversations.info", httpMethod: "GET", params: { channel: "C1" } }),
    (error) => {
      assert.equal(error.needed, "groups:read");
      assert.equal(error.provided, "channels:read");
      assert.ok(!error.message.includes(FAKE_TOKEN));
      return true;
    }
  );
});

test("auth.test result is parsed and returned as-is", async () => {
  mock = installFetchMock(() =>
    jsonResponse({ ok: true, user_id: "U123", team: "DeliveryK" })
  );

  const result = await conversations.authTest();
  assert.equal(result.user_id, "U123");
  assert.equal(result.team, "DeliveryK");
});

test("slack_list_conversations forwards types, cursor and exclude_archived", async () => {
  mock = installFetchMock((url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("types"), "public_channel,private_channel");
    assert.equal(parsed.searchParams.get("cursor"), "next-page");
    assert.equal(parsed.searchParams.get("exclude_archived"), "true");
    return jsonResponse({ ok: true, channels: [], response_metadata: { next_cursor: "" } });
  });

  await conversations.listConversations({
    types: ["public_channel", "private_channel"],
    cursor: "next-page",
    excludeArchived: true,
  });
});

test("slack_read_channel and slack_read_thread pass through pagination cursors", async () => {
  mock = installFetchMock((url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("conversations.history")) {
      assert.equal(parsed.searchParams.get("cursor"), "hist-cursor");
      return jsonResponse({ ok: true, messages: [], response_metadata: { next_cursor: "n2" } });
    }
    assert.equal(parsed.searchParams.get("cursor"), "thread-cursor");
    return jsonResponse({ ok: true, messages: [], has_more: false });
  });

  const history = await conversations.readChannel({ channel: "C1", cursor: "hist-cursor" });
  assert.equal(history.response_metadata.next_cursor, "n2");

  const thread = await conversations.readThread({ channel: "C1", ts: "123.456", cursor: "thread-cursor" });
  assert.equal(thread.has_more, false);
});

test("slack_search_users filters locally by name/display name/title and excludes deleted users by default", async () => {
  mock = installFetchMock(() =>
    jsonResponse({
      ok: true,
      members: [
        { id: "U1", name: "kim.hj", real_name: "Kim HyoungJoon", profile: { title: "영업팀" } },
        { id: "U2", name: "other", real_name: "Other Person", profile: { title: "개발팀" } },
        { id: "U3", name: "kim.deleted", real_name: "Kim Deleted", deleted: true, profile: {} },
      ],
    })
  );

  const result = await users.searchUsers({ query: "kim" });
  const ids = result.members.map((m) => m.id);
  assert.deepEqual(ids, ["U1"]);
});

test("slack_send_user_message requires confirmAsUser=true", async () => {
  await assert.rejects(() =>
    messages.sendUserMessage({ channelId: "C1", text: "hi", confirmAsUser: false })
  );
});

test("slack_send_user_message blocks mass mentions unless allowMassMention=true", async () => {
  await assert.rejects(() =>
    messages.sendUserMessage({
      channelId: "C1",
      text: "<!channel> 공지입니다",
      confirmAsUser: true,
    })
  );

  mock = installFetchMock(() => jsonResponse({ ok: true, ts: "1.1" }));
  const result = await messages.sendUserMessage({
    channelId: "C1",
    text: "@channel 공지입니다",
    confirmAsUser: true,
    allowMassMention: true,
  });
  assert.equal(result.ok, true);
});

test("slack_send_user_message rejects replyBroadcast without threadTs", async () => {
  await assert.rejects(() =>
    messages.sendUserMessage({
      channelId: "C1",
      text: "hi",
      confirmAsUser: true,
      replyBroadcast: true,
    })
  );
});

test("slack_send_user_message allows replyBroadcast when threadTs is present", async () => {
  mock = installFetchMock((url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.thread_ts, "100.1");
    assert.equal(body.reply_broadcast, true);
    return jsonResponse({ ok: true, ts: "100.2" });
  });

  const result = await messages.sendUserMessage({
    channelId: "C1",
    text: "reply",
    confirmAsUser: true,
    threadTs: "100.1",
    replyBroadcast: true,
  });
  assert.equal(result.ok, true);
});
