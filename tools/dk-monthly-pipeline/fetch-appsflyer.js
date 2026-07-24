import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { APPSFLYER_APPS, APPSFLYER_DEV_KEY_FILE, PATHS, parseYearMonth, dateRange } from "./config.js";
import { writeState } from "./lib/state.js";

// STATUS (2026-07-20): unverified — no AppsFlyer dev_key available yet in this environment.
// Endpoint shapes below follow AppsFlyer's documented Pull API v5 (raw-data + partners/aggregate
// reports, Bearer-token auth). Before trusting this script: run it for one already-known month
// (e.g. 2026-06) and diff the row counts/output against the existing manually-exported CSVs in
// data/af_ios_raw, data/af_aos_raw, data/af_ads.

const RAW_REPORT_TYPES = [
  "installs_report",
  "in_app_events_report",
  "organic_installs_report",
  "organic_in_app_events_report",
];

function readDevKey() {
  if (!fs.existsSync(APPSFLYER_DEV_KEY_FILE)) {
    throw new Error(
      `AppsFlyer dev_key not found at ${APPSFLYER_DEV_KEY_FILE}.\n` +
        `Ask an Admin on the AppsFlyer account for the Pull API token (App Settings > API 액세스),\n` +
        `save it as plain text in that file, then re-run this script.`
    );
  }
  return fs.readFileSync(APPSFLYER_DEV_KEY_FILE, "utf8").trim();
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" } }, (res) => {
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => reject(new Error(`HTTP ${res.statusCode} for ${url}: ${body.slice(0, 500)}`)));
          return;
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

async function fetchRawReport({ app, reportType, from, to, token }) {
  const url =
    `https://hq1.appsflyer.com/api/raw-data/export/app/${app.appId}/${reportType}/v5` +
    `?from=${from}&to=${to}&timezone=UTC`;
  return httpsGet(url, token);
}

function csvFileName({ platform, appId, reportKind, from, to }) {
  const prefix = platform === "ios" ? appId : appId; // matches existing naming: id..._x / com.pkg_x
  return `${prefix}_${reportKind}_${from}_${to}_UTC.csv`;
}

const REPORT_KIND_BY_TYPE = {
  installs_report: "installs",
  in_app_events_report: "in-app-events",
  organic_installs_report: "organic-installs",
  organic_in_app_events_report: "organic-in-app-events",
};

async function run(yyyyMm) {
  const { year, month } = parseYearMonth(yyyyMm);
  const token = readDevKey();
  const { from, to } = dateRange(year, month);

  fs.mkdirSync(PATHS.iosRaw, { recursive: true });
  fs.mkdirSync(PATHS.aosRaw, { recursive: true });

  for (const [platform, app] of Object.entries(APPSFLYER_APPS)) {
    const destDir = platform === "ios" ? PATHS.iosRaw : PATHS.aosRaw;
    for (const reportType of RAW_REPORT_TYPES) {
      const kind = REPORT_KIND_BY_TYPE[reportType];
      const fileName = csvFileName({ platform, appId: app.appId, reportKind: kind, from, to });
      const destPath = path.join(destDir, fileName);
      process.stdout.write(`fetching ${platform}/${kind} (${from}..${to})... `);
      const csv = await fetchRawReport({ app, reportType, from, to, token });
      fs.writeFileSync(destPath, csv, "utf8");
      console.log(`saved ${destPath} (${csv.split("\n").length - 1} rows)`);
    }
  }

  // Aggregate/partners report -> data/af_ads. NOTE: the existing af_ads CSVs look like a
  // dashboard "table view" export (unified_view, per-media-source ROAS columns), which may
  // come from a different aggregate report endpoint than raw-data. Confirm exact report type
  // against AppsFlyer's "집약형 리포트(Aggregate report)" docs link before relying on this.
  console.log("NOTE: af_ads aggregate/partners report fetch not yet implemented — see comment above.");

  writeState(yyyyMm, { af_fetched: true });
  console.log(`\nDone. Pipeline state updated: af_fetched=true for ${yyyyMm}`);
}

const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node fetch-appsflyer.js --month=YYYY-MM");
  process.exit(1);
}

run(monthArg).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
