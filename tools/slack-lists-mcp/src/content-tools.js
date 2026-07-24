import { callSlackApi } from "./slack.js";

/**
 * Normalizes a cell object (camelCase MCP-level shorthand, e.g. { columnId, kind: "raw", raw }
 * or { columnId, select }) into the flat snake_case shape the Slack Lists API expects,
 * merging any "raw" payload directly into the cell per the documented convention.
 */
export function normalizeCell(cell) {
  if (!cell || typeof cell !== "object") {
    throw new Error("cell 객체가 필요합니다.");
  }

  const columnId = cell.column_id ?? cell.columnId;
  if (!columnId) {
    throw new Error("cell에는 column_id(또는 columnId)가 필요합니다.");
  }

  const normalized = { column_id: columnId };

  const rowId = cell.row_id ?? cell.rowId;
  if (rowId) {
    normalized.row_id = rowId;
  }

  if (cell.kind === "raw" && cell.raw && typeof cell.raw === "object") {
    Object.assign(normalized, cell.raw);
  } else if (cell.select) {
    normalized.select = cell.select;
  } else if (cell.rich_text) {
    normalized.rich_text = cell.rich_text;
  } else if (cell.raw && typeof cell.raw === "object") {
    Object.assign(normalized, cell.raw);
  }

  return normalized;
}

export function buildAssigneeCell({ columnId, userIds, rowId } = {}) {
  if (!columnId || !Array.isArray(userIds) || userIds.length === 0) {
    throw new Error("columnId와 최소 1개 이상의 userIds가 필요합니다.");
  }
  return normalizeCell({
    columnId,
    rowId,
    kind: "raw",
    raw: { user: userIds },
  });
}

export async function listSchema({ listId } = {}) {
  const resolvedListId = requireListId(listId);
  return callSlackApi({
    method: "files.info",
    httpMethod: "GET",
    params: { file: resolvedListId },
  });
}

export async function listIssues({ listId, limit, cursor } = {}) {
  const resolvedListId = requireListId(listId);
  return callSlackApi({
    method: "slackLists.items.list",
    httpMethod: "POST",
    params: { list_id: resolvedListId, limit: limit ?? 100, cursor },
  });
}

export async function createList({ name, templateType, sourceListId } = {}) {
  if (!name) {
    throw new Error("name 인자가 필요합니다.");
  }
  return callSlackApi({
    method: "slackLists.create",
    httpMethod: "POST",
    params: {
      name,
      template_type: templateType,
      source_list_id: sourceListId,
    },
  });
}

export async function createIssue({ listId, cells } = {}) {
  const resolvedListId = requireListId(listId);
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error("최소 1개 이상의 cells가 필요합니다.");
  }
  return callSlackApi({
    method: "slackLists.items.create",
    httpMethod: "POST",
    params: {
      list_id: resolvedListId,
      initial_fields: cells.map(normalizeCell),
    },
  });
}

export async function updateIssue({ listId, cells } = {}) {
  const resolvedListId = requireListId(listId);
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error("최소 1개 이상의 cells가 필요합니다.");
  }
  const normalized = cells.map(normalizeCell);
  for (const cell of normalized) {
    if (!cell.row_id) {
      throw new Error("수정용 cell에는 row_id(또는 rowId)가 필요합니다.");
    }
  }
  return callSlackApi({
    method: "slackLists.items.update",
    httpMethod: "POST",
    params: { list_id: resolvedListId, cells: normalized },
  });
}

function extractColumns(schemaResponse) {
  return (
    schemaResponse?.file?.list_metadata?.schema ??
    schemaResponse?.file?.schema ??
    []
  );
}

function resolveOptionId(column, doneOptionId, doneLabel) {
  if (doneOptionId) return doneOptionId;
  const option = (column.options || []).find(
    (candidate) =>
      typeof (candidate.label ?? candidate.name ?? candidate.value) === "string" &&
      (candidate.label ?? candidate.name ?? candidate.value).toLowerCase() ===
        String(doneLabel).toLowerCase()
  );
  if (!option) {
    throw new Error(`상태 옵션을 찾을 수 없습니다: ${doneLabel}`);
  }
  return option.id;
}

export async function completeIssue({
  listId,
  itemId,
  statusColumnId,
  doneOptionId,
  statusLabel,
  doneLabel,
} = {}) {
  const resolvedListId = requireListId(listId);
  if (!itemId) {
    throw new Error("itemId 인자가 필요합니다.");
  }

  const schema = await listSchema({ listId: resolvedListId });
  const columns = extractColumns(schema);

  if (statusColumnId) {
    const column = columns.find((candidate) => candidate.id === statusColumnId);
    const optionId = resolveOptionId(column || { options: [] }, doneOptionId, doneLabel);
    return updateIssue({
      listId: resolvedListId,
      cells: [{ columnId: statusColumnId, rowId: itemId, select: [optionId] }],
    });
  }

  const todoColumn = columns.find((column) => column.type === "todo_completed");
  if (todoColumn) {
    return updateIssue({
      listId: resolvedListId,
      cells: [
        {
          columnId: todoColumn.id,
          rowId: itemId,
          kind: "raw",
          raw: { checkbox: true },
        },
      ],
    });
  }

  const selectStatusColumn = columns.find(
    (column) =>
      column.type === "select" &&
      typeof column.name === "string" &&
      (/상태|status/i.test(column.name) || (statusLabel && column.name === statusLabel))
  );
  if (selectStatusColumn) {
    const optionId = resolveOptionId(selectStatusColumn, doneOptionId, doneLabel || "완료");
    return updateIssue({
      listId: resolvedListId,
      cells: [{ columnId: selectStatusColumn.id, rowId: itemId, select: [optionId] }],
    });
  }

  throw new Error(
    "상태 컬럼을 찾지 못했습니다. statusColumnId와 doneOptionId(또는 doneLabel)를 직접 지정하세요."
  );
}

function requireListId(listId) {
  const resolved = listId || process.env.SLACK_LIST_ID;
  if (!resolved) {
    throw new Error(
      "listId 인자가 없고 SLACK_LIST_ID 환경변수도 설정되어 있지 않습니다."
    );
  }
  return resolved;
}
