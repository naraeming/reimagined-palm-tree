import { callSlackApi } from "./slack.js";

const VALID_OPERATIONS = new Set([
  "insert_before",
  "insert_after",
  "insert_at_start",
  "insert_at_end",
  "replace",
  "rename",
]);

export async function createCanvas({ title, documentContent, channelId } = {}) {
  return callSlackApi({
    method: "canvases.create",
    httpMethod: "POST",
    params: {
      title,
      document_content: documentContent,
      channel_id: channelId,
    },
  });
}

export async function createChannelCanvas({ channelId, documentContent } = {}) {
  if (!channelId) {
    throw new Error("channelId 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "conversations.canvases.create",
    httpMethod: "POST",
    params: {
      channel_id: channelId,
      document_content: documentContent,
    },
  });
}

export async function canvasInfo({ canvasId } = {}) {
  if (!canvasId) {
    throw new Error("canvasId 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "files.info",
    httpMethod: "GET",
    params: { file: canvasId },
  });
}

export async function canvasSections({ canvasId, criteria } = {}) {
  if (!canvasId) {
    throw new Error("canvasId 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "canvases.sections.lookup",
    httpMethod: "POST",
    params: { canvas_id: canvasId, criteria },
  });
}

function isWholeCanvasReplace(change) {
  return change.operation === "replace" && !change.section_id;
}

export async function updateCanvas({ canvasId, changes, replaceWholeCanvas } = {}) {
  if (!canvasId || !Array.isArray(changes) || changes.length === 0) {
    throw new Error("canvasId와 최소 1개 이상의 changes 배열이 필요합니다.");
  }

  for (const change of changes) {
    if (!VALID_OPERATIONS.has(change.operation)) {
      throw new Error(`지원하지 않는 operation입니다: ${change.operation}`);
    }
    if (isWholeCanvasReplace(change) && replaceWholeCanvas !== true) {
      throw new Error(
        "캔버스 전체 교체는 replaceWholeCanvas=true를 명시적으로 전달해야 합니다."
      );
    }
  }

  return callSlackApi({
    method: "canvases.edit",
    httpMethod: "POST",
    params: { canvas_id: canvasId, changes },
  });
}
