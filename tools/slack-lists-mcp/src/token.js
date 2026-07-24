import { Entry } from "@napi-rs/keyring";
import { KEYRING_SERVICE, resolveAccount } from "./config.js";

const NOT_FOUND_ERROR =
  "Slack User Token을 찾을 수 없습니다. 먼저 `npm run save-token`을 실행해 토큰을 저장하세요.";

function entry() {
  return new Entry(KEYRING_SERVICE, resolveAccount());
}

export function saveToken(token) {
  entry().setPassword(token);
}

// Unit tests inject a fake token here to avoid touching the real OS keyring;
// production code paths never call this.
let testTokenOverride;

export function __setTestToken(token) {
  testTokenOverride = token;
}

export function getToken() {
  if (testTokenOverride !== undefined) {
    return testTokenOverride;
  }

  let token;
  try {
    token = entry().getPassword();
  } catch {
    token = null;
  }
  if (!token) {
    const error = new Error(NOT_FOUND_ERROR);
    error.code = "SLACK_TOKEN_NOT_FOUND";
    throw error;
  }
  return token;
}

export function deleteToken() {
  try {
    entry().deletePassword();
    return true;
  } catch {
    return false;
  }
}
