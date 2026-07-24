import fs from "node:fs";

/** Minimal RFC4180 CSV parser: quoted fields, escaped "" quotes, CRLF/LF. No external deps. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads a CSV file and returns [{header: value, ...}, ...]. Strips a UTF-8 BOM if present.
 * Fine for small/medium files; for AppsFlyer's organic-in-app-events exports (100MB+, one row
 * per event) use `streamCsvRows` instead so the whole file isn't materialized as JS objects. */
export function readCsvAsObjects(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCsv(text).filter((r) => r.length > 1 || r[0] !== "");
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

/**
 * Streams a CSV file row-by-row (as {header: value} objects) without holding the whole file or
 * the full row set in memory — only the current chunk/row. `onRow` is called synchronously for
 * each data row; return value is ignored. Handles quoted fields (incl. embedded newlines) same
 * as `parseCsv`, just incrementally over read-stream chunks instead of one big string.
 */
export async function streamCsvRows(filePath, onRow) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 1 << 20 });
  let header = null;
  let row = [];
  let field = "";
  let inQuotes = false;
  let sawFirstChar = false;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    if (row.length > 1 || row[0] !== "") {
      if (!header) {
        header = row;
      } else {
        const obj = {};
        header.forEach((h, idx) => (obj[h] = row[idx] ?? ""));
        onRow(obj);
      }
    }
    row = [];
  }

  for await (const chunkRaw of stream) {
    let chunk = chunkRaw;
    if (!sawFirstChar) {
      sawFirstChar = true;
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (inQuotes) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') {
            field += '"';
            i += 1;
            continue;
          }
          inQuotes = false;
          continue;
        }
        field += ch;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        endField();
        continue;
      }
      if (ch === "\r") continue;
      if (ch === "\n") {
        endRow();
        continue;
      }
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) endRow();
}
