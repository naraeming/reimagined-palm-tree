import { callSlackApi } from "./slack.js";

export async function authTest() {
  return callSlackApi({ method: "auth.test", httpMethod: "POST", params: {} });
}

export async function listConversations({ types, limit, cursor, excludeArchived } = {}) {
  return callSlackApi({
    method: "conversations.list",
    httpMethod: "GET",
    params: {
      types: types && types.length ? types.join(",") : undefined,
      limit,
      cursor,
      exclude_archived: excludeArchived,
    },
  });
}

export async function channelInfo({ channel }) {
  if (!channel) {
    throw new Error("channel 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "conversations.info",
    httpMethod: "GET",
    params: { channel },
  });
}

export async function readChannel({ channel, limit, cursor, oldest, latest } = {}) {
  if (!channel) {
    throw new Error("channel 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "conversations.history",
    httpMethod: "GET",
    params: { channel, limit, cursor, oldest, latest },
  });
}

export async function readThread({ channel, ts, limit, cursor } = {}) {
  if (!channel || !ts) {
    throw new Error("channel과 ts 인자가 모두 필요합니다.");
  }
  return callSlackApi({
    method: "conversations.replies",
    httpMethod: "GET",
    params: { channel, ts, limit, cursor },
  });
}
