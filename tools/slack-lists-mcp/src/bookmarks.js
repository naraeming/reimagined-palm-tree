import { callSlackApi } from "./slack.js";

export async function listLinks({ channelId } = {}) {
  if (!channelId) {
    throw new Error("channelId 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "bookmarks.list",
    httpMethod: "GET",
    params: { channel_id: channelId },
  });
}

export async function createLink({ channelId, title, url, emoji } = {}) {
  if (!channelId || !title || !url) {
    throw new Error("channelId, title, url 인자가 모두 필요합니다.");
  }
  return callSlackApi({
    method: "bookmarks.add",
    httpMethod: "POST",
    params: {
      channel_id: channelId,
      title,
      type: "link",
      link: url,
      emoji,
    },
  });
}

export async function updateLink({ channelId, bookmarkId, title, url, emoji } = {}) {
  if (!channelId || !bookmarkId) {
    throw new Error("channelId와 bookmarkId 인자가 모두 필요합니다.");
  }
  return callSlackApi({
    method: "bookmarks.edit",
    httpMethod: "POST",
    params: {
      channel_id: channelId,
      bookmark_id: bookmarkId,
      title,
      link: url,
      emoji,
    },
  });
}
