import { callSlackApi } from "./slack.js";

function matches(user, query) {
  const q = query.toLowerCase();
  const candidates = [
    user.name,
    user.real_name,
    user.profile?.display_name,
    user.profile?.real_name,
    user.profile?.title,
  ];
  return candidates.some((value) => typeof value === "string" && value.toLowerCase().includes(q));
}

export async function searchUsers({ query, limit, cursor, includeInactive } = {}) {
  if (!query) {
    throw new Error("query 인자가 필요합니다.");
  }
  const response = await callSlackApi({
    method: "users.list",
    httpMethod: "GET",
    params: { limit, cursor },
  });

  const members = (response.members || []).filter((user) => {
    if (!includeInactive && user.deleted) return false;
    return matches(user, query);
  });

  return {
    ok: true,
    members,
    response_metadata: response.response_metadata,
  };
}
