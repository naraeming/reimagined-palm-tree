import fs from "node:fs";
import path from "node:path";
import { PATHS, parseYearMonth, isQuarterEndMonth, quarterForMonth } from "./config.js";
import { upsertRow } from "./lib/xlsxRowEditor.js";
import { buildQuarterlyReport } from "./build-quarterly-report.js";

// Step 3 of the pipeline: write the analysis results back into the local master workbook
// (Desktop\DK_monthly\배달K_누적마스터_월별집계.xlsx). Surgically upserts the month's row in the
// "1.월별요약" sheet (sheet2.xml) so the rest of the workbook — other sheets, styling, charts —
// is preserved untouched. Backs the original up first (…_backup_<YYYYMMDD>.xlsx), matching the
// convention used for the manual Q2-report edit on 2026-07-20.
//
// Column order of 1.월별요약: 월 | 주문수 | 주문유저 | 매출(USD) | Android주문 | iOS주문 | iOS 비중
// NOTE: only the master monthly-summary sheet is auto-updated here. The per-dimension sheets
// (국가/언어/세그먼트/ROAS) and the quarterly report file are left for a later iteration.

function backupName(originalPath, yyyymmdd) {
  const dir = path.dirname(originalPath);
  const ext = path.extname(originalPath);
  const base = path.basename(originalPath, ext);
  return path.join(dir, `${base}_backup_${yyyymmdd}${ext}`);
}

function todayStamp() {
  // No Date.now() dependency concerns here (plain CLI script); use ISO date.
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function run(yyyyMm) {
  parseYearMonth(yyyyMm); // validate format
  const analysisPath = path.join(PATHS.pipelineState, `${yyyyMm}-analysis.json`);
  if (!fs.existsSync(analysisPath)) {
    throw new Error(`No analysis found at ${analysisPath}. Run: node analyze.js --month=${yyyyMm}`);
  }
  const a = JSON.parse(fs.readFileSync(analysisPath, "utf8"));

  if (!fs.existsSync(PATHS.masterXlsx)) {
    throw new Error(`Master workbook not found: ${PATHS.masterXlsx}`);
  }

  const androidOrders = a.osShare.android.orders;
  const iosOrders = a.osShare.ios.orders;
  const iosShare = a.afOrders ? iosOrders / a.afOrders : 0;

  const values = [
    { v: yyyyMm, type: "string" },
    { v: a.afOrders, type: "number" },
    { v: a.orderingUsers, type: "number" },
    { v: a.gmvUsd, type: "number" },
    { v: androidOrders, type: "number" },
    { v: iosOrders, type: "number" },
    { v: Number(iosShare.toFixed(4)), type: "number" },
  ];

  const backup = backupName(PATHS.masterXlsx, todayStamp());
  fs.copyFileSync(PATHS.masterXlsx, backup);

  const result = upsertRow(PATHS.masterXlsx, PATHS.masterXlsx, "sheet2.xml", yyyyMm, values);

  console.log(`Master workbook updated: 1.월별요약 row for ${yyyyMm} (${result.updated ? "updated existing" : "appended new"} row ${result.rowNum}).`);
  console.log(`Backup saved: ${backup}`);
  console.log(`Values: 주문수=${a.afOrders} 주문유저=${a.orderingUsers} GMV=$${a.gmvUsd} Android=${androidOrders} iOS=${iosOrders} iOS비중=${(iosShare * 100).toFixed(1)}%`);

  // Quarter-end months (3/6/9/12): also (re)generate the quarterly analysis report, aggregating
  // that quarter's monthly analyses. Monthly master stays monthly; the analysis report is quarterly.
  const { month } = parseYearMonth(yyyyMm);
  if (isQuarterEndMonth(month)) {
    const year = Number(yyyyMm.split("-")[0]);
    const quarter = quarterForMonth(month);
    console.log(`\n${yyyyMm} is a quarter-end month → generating Q${quarter} ${year} analysis report...`);
    const q = buildQuarterlyReport(year, quarter);
    console.log(`Quarterly report written: ${q.outPath}`);
    console.log(`  months included: ${q.found.join(", ")}${q.missing.length ? ` | missing (excluded): ${q.missing.join(", ")}` : ""}`);
  }
}

const monthArg = process.argv.find((x) => x.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node update-local-files.js --month=YYYY-MM");
  process.exit(1);
}
try {
  run(monthArg);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
