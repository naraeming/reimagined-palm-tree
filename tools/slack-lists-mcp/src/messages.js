import { callSlackApi } from "./slack.js";

const MASS_MENTION_PATTERN = /@(channel|here|everyone)\b|<!(channel|here|everyone)(\|[^>]*)?>/i;

export function containsMassMention(text) {
  return MASS_MENTION_PATTERN.test(text || "");
}

export async function sendUserMessage({
  channelId,
  text,
  confirmAsUser,
  allowMassMention,
  threadTs,
  replyBroadcast,
  unfurlLinks,
  unfurlMedia,
} = {}) {
  if (!channelId || !text) {
    throw new Error("channelId와 text 인자가 모두 필요합니다.");
  }

  if (confirmAsUser !== true) {
    throw new Error(
      "confirmAsUser=true를 명시적으로 전달해야 메시지를 전송할 수 있습니다."
    );
  }

  if (containsMassMention(text) && allowMassMention !== true) {
    throw new Error(
      "@channel/@here/@everyone 멘션이 포함되어 있습니다. allowMassMention=true를 명시적으로 전달해야 합니다."
    );
  }

  if (replyBroadcast === true && !threadTs) {
    throw new Error("replyBroadcast=true는 threadTs가 있을 때만 사용할 수 있습니다.");
  }

  return callSlackApi({
    method: "chat.postMessage",
    httpMethod: "POST",
    params: {
      channel: channelId,
      text,
      thread_ts: threadTs,
      reply_broadcast: threadTs ? replyBroadcast : undefined,
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlMedia,
    },
  });
}
