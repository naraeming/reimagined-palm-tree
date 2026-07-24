import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { callSlackApi } from "./slack.js";
import { getToken } from "./token.js";
import {
  MAX_UPLOAD_BYTES,
  DEFAULT_FILE_READ_BYTES,
  MAX_FILE_READ_BYTES,
} from "./config.js";

const ALLOWED_FILE_HOST_SUFFIXES = [".slack.com", ".slack-files.com"];
const ALLOWED_FILE_HOSTS = ["slack.com", "slack-files.com"];

export function isAllowedSlackFileHost(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  return (
    ALLOWED_FILE_HOSTS.includes(hostname) ||
    ALLOWED_FILE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

export async function fileInfo({ fileId } = {}) {
  if (!fileId) {
    throw new Error("fileId 인자가 필요합니다.");
  }
  return callSlackApi({ method: "files.info", httpMethod: "GET", params: { file: fileId } });
}

export async function readFile({ fileId, encoding = "text", maxBytes } = {}) {
  if (!fileId) {
    throw new Error("fileId 인자가 필요합니다.");
  }

  const info = await fileInfo({ fileId });
  const url = info.file?.url_private || info.file?.url_private_download;
  if (!url) {
    throw new Error("파일의 다운로드 URL을 찾을 수 없습니다.");
  }
  if (!isAllowedSlackFileHost(url)) {
    throw new Error("Slack이 발급한 파일 호스트가 아닌 URL은 다운로드할 수 없습니다.");
  }

  const cap = Math.min(maxBytes || DEFAULT_FILE_READ_BYTES, MAX_FILE_READ_BYTES);
  const token = getToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`파일 다운로드에 실패했습니다 (HTTP ${response.status}).`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      const remaining = cap - (total - value.byteLength);
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return {
    file_id: fileId,
    truncated,
    byte_length: buffer.byteLength,
    encoding,
    content: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf-8"),
  };
}

async function assertWithinAllowedRoots(localPath, uploadRoots) {
  let realTarget;
  try {
    realTarget = await fsPromises.realpath(localPath);
  } catch {
    throw new Error(`파일을 찾을 수 없습니다: ${localPath}`);
  }

  const realRoots = [];
  for (const root of uploadRoots) {
    try {
      realRoots.push(await fsPromises.realpath(root));
    } catch {
      // allowed root doesn't exist locally; skip
    }
  }

  const isInside = realRoots.some((root) => {
    const relative = path.relative(root, realTarget);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });

  if (!isInside) {
    throw new Error(
      `허용된 업로드 루트 밖의 파일은 업로드할 수 없습니다: ${localPath}`
    );
  }

  return realTarget;
}

export async function uploadFile({ localPath, filename, channelId, uploadRoots } = {}) {
  if (!localPath) {
    throw new Error("localPath 인자가 필요합니다.");
  }
  if (!Array.isArray(uploadRoots) || uploadRoots.length === 0) {
    throw new Error("허용된 업로드 루트가 설정되어 있지 않습니다.");
  }

  const realTarget = await assertWithinAllowedRoots(localPath, uploadRoots);

  const stat = await fsPromises.stat(realTarget);
  if (!stat.isFile()) {
    throw new Error(`일반 파일만 업로드할 수 있습니다: ${localPath}`);
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `파일 크기가 최대 허용치(${MAX_UPLOAD_BYTES} bytes)를 초과합니다: ${stat.size} bytes`
    );
  }

  const resolvedFilename = filename || path.basename(realTarget);

  const uploadUrlResponse = await callSlackApi({
    method: "files.getUploadURLExternal",
    httpMethod: "GET",
    params: { filename: resolvedFilename, length: stat.size },
  });

  const token = getToken();
  const fileBuffer = await fsPromises.readFile(realTarget);
  const putResponse = await fetch(uploadUrlResponse.upload_url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fileBuffer,
  });
  if (!putResponse.ok) {
    throw new Error(`파일 업로드에 실패했습니다 (HTTP ${putResponse.status}).`);
  }

  return callSlackApi({
    method: "files.completeUploadExternal",
    httpMethod: "POST",
    params: {
      files: [{ id: uploadUrlResponse.file_id, title: resolvedFilename }],
      channel_id: channelId,
    },
  });
}
