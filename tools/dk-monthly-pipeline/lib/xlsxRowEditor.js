import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { writeZip } from "./xlsxWriter.js";

// Surgically appends/updates a single data row in one worksheet of an existing .xlsx WITHOUT
// rewriting the whole workbook — this preserves the master file's styling, other sheets, charts,
// column widths, etc. (writeXlsx would flatten all of that). Same unzip → edit-one-XML → rezip
// approach proven in the 2026-07-20 session on the Q2 report. New cells are written as inlineStr
// or numeric so we never have to touch sharedStrings.xml.

function unzipToTemp(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dk-xlsx-edit-"));
  execFileSync("unzip", ["-o", filePath, "-d", dir], { stdio: "ignore" });
  return dir;
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(decodeEntities(texts.join("")));
  }
  return strings;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&amp;/g, "&");
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colLetter(index) {
  let n = index + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Resolve the displayed value of the first cell (column A) of a <row> block, whether shared or inline. */
function firstCellValue(rowXml, shared) {
  const cMatch = rowXml.match(/<c\b[^>]*r="A\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/);
  if (!cMatch) return null;
  const attrs = rowXml.match(/<c\b[^>]*r="A\d+"[^>]*?(?:\/|>)/)[0];
  const inner = cMatch[1] || "";
  const isShared = /t="s"/.test(attrs);
  const isInline = /t="(inlineStr|str)"/.test(attrs);
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  const is = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  if (isShared && v) return shared[parseInt(v[1], 10)];
  if (isInline && is) return decodeEntities(is[1]);
  if (v) return decodeEntities(v[1]);
  return null;
}

function buildRow(rowNum, values) {
  // values: array of {v, type} where type is 'number' | 'string'
  const cells = values
    .map((val, i) => {
      const ref = `${colLetter(i)}${rowNum}`;
      if (val === null || val === undefined || val === "") return "";
      if (val.type === "number") return `<c r="${ref}"><v>${val.v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(val.v)}</t></is></c>`;
    })
    .join("");
  return `<row r="${rowNum}" spans="1:${values.length}">${cells}</row>`;
}

/**
 * Append or update one data row in worksheet `sheetFile` (e.g. "sheet2.xml") of `xlsxPath`.
 * - keyValue: the column-A label to match (e.g. "2026-07"); if a data row already has this
 *   label its cells are replaced, otherwise a new row is appended after the last row.
 * - values: array of {v, type:'number'|'string'} for columns A, B, C, ... in order.
 * Writes the modified workbook back to `outPath` (may equal xlsxPath).
 */
export function upsertRow(xlsxPath, outPath, sheetFile, keyValue, values) {
  const dir = unzipToTemp(xlsxPath);
  try {
    const sharedPath = path.join(dir, "xl/sharedStrings.xml");
    const shared = fs.existsSync(sharedPath) ? parseSharedStrings(fs.readFileSync(sharedPath, "utf8")) : [];
    const sheetPath = path.join(dir, "xl/worksheets", sheetFile);
    let xml = fs.readFileSync(sheetPath, "utf8");

    const rowBlocks = [...xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
    let existingRowNum = null;
    let maxRowNum = 0;
    for (const rb of rowBlocks) {
      const rn = parseInt(rb[1], 10);
      maxRowNum = Math.max(maxRowNum, rn);
      if (firstCellValue(rb[0], shared) === keyValue) existingRowNum = rn;
    }

    if (existingRowNum !== null) {
      const newRow = buildRow(existingRowNum, values);
      xml = xml.replace(new RegExp(`<row\\b[^>]*r="${existingRowNum}"[^>]*>[\\s\\S]*?<\\/row>`), newRow);
    } else {
      const newRow = buildRow(maxRowNum + 1, values);
      xml = xml.replace("</sheetData>", `${newRow}</sheetData>`);
      // widen <dimension> if present so Excel shows the new row
      xml = xml.replace(/(<dimension ref="[A-Z]+\d+:)([A-Z]+)(\d+)("\/>)/, (m, p1, col, _r, p4) => `${p1}${col}${maxRowNum + 1}${p4}`);
    }

    fs.writeFileSync(sheetPath, xml);

    // Rezip every part exactly as-is except the one sheet we changed.
    const entries = collectZipEntries(dir);
    writeZip(entries, outPath);
    return { updated: existingRowNum !== null, rowNum: existingRowNum ?? maxRowNum + 1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function collectZipEntries(root) {
  const entries = [];
  function walk(d, base) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else entries.push({ name: rel, content: fs.readFileSync(full) });
    }
  }
  walk(root, "");
  return entries;
}
