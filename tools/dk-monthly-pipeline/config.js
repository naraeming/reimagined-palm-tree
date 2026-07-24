import path from "node:path";
import os from "node:os";

// All paths point at the user's existing DK_monthly working folder (outside this repo) —
// see memory/reference_deliveryk_marketing_data.md for why this is the authoritative copy.
export const DK_MONTHLY_ROOT = path.join(os.homedir(), "Desktop", "DK_monthly");
export const DATA_ROOT = path.join(DK_MONTHLY_ROOT, "data");

export const PATHS = {
  iosRaw: path.join(DATA_ROOT, "af_ios_raw"),
  aosRaw: path.join(DATA_ROOT, "af_aos_raw"),
  ads: path.join(DATA_ROOT, "af_ads"),
  appDb: path.join(DATA_ROOT, "app_db"),
  cohort: path.join(DATA_ROOT, "cohort_data"),
  pipelineState: path.join(DATA_ROOT, ".pipeline-state"),
  secrets: path.join(DK_MONTHLY_ROOT, ".secrets"),
  masterXlsx: path.join(DK_MONTHLY_ROOT, "배달K_누적마스터_월별집계.xlsx"),
};

export const APPSFLYER_APPS = {
  ios: { platform: "ios", appId: "id1456285291" },
  android: { platform: "android", appId: "com.teamjin.deliveryk" },
};

export const APPSFLYER_DEV_KEY_FILE = path.join(PATHS.secrets, "appsflyer_dev_key.txt");

// Quarter-end months per the standard Q1-Q4 convention (see
// memory/project_deliveryk_quarter_convention.md) — a quarterly rollup is produced
// in addition to the monthly report when the pipeline runs for one of these months.
export const QUARTER_END_MONTHS = [3, 6, 9, 12];

export function quarterForMonth(month) {
  return Math.ceil(month / 3);
}

export function quarterMonthRange(year, quarter) {
  const endMonth = quarter * 3;
  const startMonth = endMonth - 2;
  return { startMonth, endMonth, year };
}

export function isQuarterEndMonth(month) {
  return QUARTER_END_MONTHS.includes(month);
}

/** "2026-07" -> { year: 2026, month: 7 } */
export function parseYearMonth(yyyyMm) {
  const [year, month] = yyyyMm.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid --month value: "${yyyyMm}" (expected YYYY-MM)`);
  }
  return { year, month };
}

export function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** AppsFlyer raw-data report file naming uses the from/to date range as UTC calendar-month bounds. */
export function dateRange(year, month) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  return { from, to };
}

const AF_RAW_FILE_KIND = {
  installs: "installs",
  organicInstalls: "organic-installs",
  events: "in-app-events",
  organicEvents: "organic-in-app-events",
};

/** Builds the on-disk path for one of the 4 raw-data CSVs AppsFlyer produces per platform per month. */
export function afRawFilePath(platform, kind, year, month) {
  const app = APPSFLYER_APPS[platform];
  const dir = platform === "ios" ? PATHS.iosRaw : PATHS.aosRaw;
  const { from, to } = dateRange(year, month);
  return path.join(dir, `${app.appId}_${AF_RAW_FILE_KIND[kind]}_${from}_${to}_UTC.csv`);
}

/** App DB export is manually named "<N>월 앱 DB.xlsx" (Korean month number, no leading zero). */
export function appDbFilePath(month) {
  return path.join(PATHS.appDb, `${month}월 앱 DB.xlsx`);
}
