import os from "node:os";
import path from "node:path";

export const KEYRING_SERVICE = "deliveryk-slack-lists-mcp";

export function resolveAccount() {
  return (
    process.env.SLACK_LISTS_ACCOUNT ||
    process.env.USER ||
    process.env.USERNAME ||
    os.userInfo().username
  );
}

export const SLACK_API_BASE_URL = "https://slack.com/api";

export const DEFAULT_LIST_ID = process.env.SLACK_LIST_ID || null;

export function resolveUploadRoots(repoRoot) {
  if (process.env.SLACK_UPLOAD_ROOTS) {
    return process.env.SLACK_UPLOAD_ROOTS
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [repoRoot, "C:\\tmp"].filter(Boolean);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_FILE_READ_BYTES = 1 * 1024 * 1024;
export const MAX_FILE_READ_BYTES = 5 * 1024 * 1024;
