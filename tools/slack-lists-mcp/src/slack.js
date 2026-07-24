import { SLACK_API_BASE_URL } from "./config.js";
import { getToken } from "./token.js";

export class SlackApiError extends Error {
  constructor(message, { slackError, needed, provided, httpStatus } = {}) {
    super(message);
    this.name = "SlackApiError";
    this.slackError = slackError;
    this.needed = needed;
    this.provided = provided;
    this.httpStatus = httpStatus;
  }
}

function buildQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    search.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function scopeHintFromResponse(response) {
  const provided = response.headers.get("x-oauth-scopes") || undefined;
  const needed = response.headers.get("x-accepted-oauth-scopes") || undefined;
  return { provided, needed };
}

/**
 * @param {object} opts
 * @param {string} opts.method Slack Web API method, e.g. "conversations.list"
 * @param {"GET"|"POST"} [opts.httpMethod]
 * @param {object} [opts.params]
 */
export async function callSlackApi({ method, httpMethod = "POST", params = {} }) {
  const token = getToken();
  const url = `${SLACK_API_BASE_URL}/${method}${
    httpMethod === "GET" ? buildQueryString(params) : ""
  }`;

  let response;
  try {
    response = await fetch(url, {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(httpMethod === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      },
      body: httpMethod === "POST" ? JSON.stringify(params) : undefined,
    });
  } catch (cause) {
    throw new SlackApiError(`Slack API 요청에 실패했습니다: ${method}`, {});
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new SlackApiError(
      `Slack API 응답을 파싱할 수 없습니다 (HTTP ${response.status}): ${method}`,
      { httpStatus: response.status }
    );
  }

  if (!response.ok) {
    const { provided, needed } = scopeHintFromResponse(response);
    throw new SlackApiError(`Slack API HTTP 오류 (${response.status}): ${method}`, {
      httpStatus: response.status,
      provided,
      needed,
    });
  }

  if (body.ok === false) {
    const { provided, needed } = scopeHintFromResponse(response);
    const detail =
      body.error === "missing_scope"
        ? ` (needed=${body.needed || needed || "unknown"}, provided=${body.provided || provided || "unknown"})`
        : "";
    throw new SlackApiError(`Slack API 오류: ${body.error}${detail}`, {
      slackError: body.error,
      needed: body.needed || needed,
      provided: body.provided || provided,
    });
  }

  return body;
}

export function toMcpJsonContent(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function toMcpErrorContent(error) {
  const message =
    error instanceof SlackApiError
      ? error.message
      : error?.code === "SLACK_TOKEN_NOT_FOUND"
        ? error.message
        : `예상치 못한 오류가 발생했습니다: ${error?.message || String(error)}`;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}
