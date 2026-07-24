import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

// Dependency-free .xlsx reader (no openpyxl/python and no `xlsx` npm package available on this
// machine — see memory/reference_deliveryk_marketing_data.md). Shells out to the system `unzip`
// (present via Git Bash / MSYS on this Windows box) to extract the archive, then hand-parses the
// worksheet + sharedStrings XML. Only reads first-sheet-by-default cell values as strings/numbers;
// no styles/formulas support, which is all this pipeline needs.

function unzipToTemp(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dk-xlsx-"));
  execFileSync("unzip", ["-o", filePath, "-d", dir], { stdio: "ignore" });
  return dir;
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(decodeXmlEntities(texts.join("")));
  }
  return strings;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function colToIndex(col) {
  let idx = 0;
  for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
  return idx - 1;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml))) {
    const rowContent = rm[2];
    const cRegex = /<c ([^>]*?)(\/?)>(?:([\s\S]*?)<\/c>)?/g;
    const cells = [];
    let cm;
    while ((cm = cRegex.exec(rowContent))) {
      const attrs = cm[1];
      const inner = cm[3] || "";
      const refMatch = attrs.match(/r="([A-Z]+)(\d+)"/);
      if (!refMatch) continue;
      const col = refMatch[1];
      const typeMatch = attrs.match(/t="([^"]*)"/);
      const type = typeMatch ? typeMatch[1] : null;
      let value = null;
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
      if (vMatch) {
        value = type === "s" ? sharedStrings[parseInt(vMatch[1], 10)] : vMatch[1];
        if (type !== "s" && type !== "str") {
          const n = Number(value);
          if (Number.isFinite(n)) value = n;
        }
      } else if (isMatch) {
        value = decodeXmlEntities(isMatch[1]);
      }
      cells[colToIndex(col)] = value === null ? null : type === "s" || type === "str" || type === null ? (typeof value === "string" ? decodeXmlEntities(value) : value) : value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Reads the first worksheet (or `sheetFile` like "sheet2.xml") of an .xlsx as an array of arrays. */
export function readXlsxSheet(filePath, sheetFile = "sheet1.xml") {
  const dir = unzipToTemp(filePath);
  try {
    const sharedPath = path.join(dir, "xl/sharedStrings.xml");
    const shared = fs.existsSync(sharedPath) ? parseSharedStrings(fs.readFileSync(sharedPath, "utf8")) : [];
    const sheetXml = fs.readFileSync(path.join(dir, "xl/worksheets", sheetFile), "utf8");
    return parseSheetRows(sheetXml, shared);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
