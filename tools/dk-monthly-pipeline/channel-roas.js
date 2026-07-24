import fs from "node:fs";
import path from "node:path";
import { PATHS, parseYearMonth, dateRange } from "./config.js";
import { readCsvAsObjects } from "./lib/csv.js";

// Channel ROAS from the AppsFlyer "platform-table unified view" cost export (data/af_ads/*.csv)
// combined with the month's analysis JSON (for the blended take-rate). The export has, per
// media-source × campaign: Cost, Installs, and AppsFlyer-attributed cumulative Revenue (GMV).
//
// We aggregate to media-source (channel) level and report:
//   - spend, installs, 귀속 GMV(USD)
//   - GMV ROAS   = 귀속GMV / spend            (거래액 기준, 부풀려짐)
//   - 순 ROAS    = GMV ROAS × blended take-rate (회사 실수익 기준)
//   - CAC(설치)  = spend / installs           (= eCPI)
//   - 손익분기 GMV ROAS = 1 / take-rate, and whether the channel clears it
//
// Usage: node channel-roas.js --month=YYYY-MM
// Ad-spend CSVs must be dropped into data/af_ads/ (filename must contain the month's date range,
// e.g. ..._2026-05-01__2026-05-31_..._USD_....csv).

const COL = {
  source: "Media source",
  cost: "Cost",
  installs: "Installs appsflyer",
  revenueLtv: "Revenue ltv days cumulative appsflyer",
};

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function findAdsFiles(year, month) {
  const { from, to } = dateRange(year, month);
  if (!fs.existsSync(PATHS.ads)) return [];
  return fs
    .readdirSync(PATHS.ads)
    .filter((f) => f.toLowerCase().endsWith(".csv") && f.includes(from) && f.includes(to))
    .map((f) => path.join(PATHS.ads, f));
}

function loadTakeRate(yyyyMm) {
  const p = path.join(PATHS.pipelineState, `${yyyyMm}-analysis.json`);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return d.commission?.blendedTakeRatePct ?? null;
}

function analyze(yyyyMm) {
  const { year, month } = parseYearMonth(yyyyMm);
  const files = findAdsFiles(year, month);
  if (files.length === 0) {
    throw new Error(
      `No ad-spend CSV found for ${yyyyMm} in ${PATHS.ads}.\n` +
        `Drop the AppsFlyer platform-table export there (filename must contain ` +
        `${dateRange(year, month).from}__${dateRange(year, month).to}).`
    );
  }

  const byChannel = {};
  for (const file of files) {
    for (const r of readCsvAsObjects(file)) {
      const src = r[COL.source] || "(미상)";
      const e = byChannel[src] || (byChannel[src] = { spend: 0, installs: 0, gmvUsd: 0 });
      e.spend += num(r[COL.cost]);
      e.installs += num(r[COL.installs]);
      e.gmvUsd += num(r[COL.revenueLtv]);
    }
  }

  const takeRatePct = loadTakeRate(yyyyMm);
  const takeRate = takeRatePct != null ? takeRatePct / 100 : null;
  const breakEvenGmvRoas = takeRate ? Number((1 / takeRate).toFixed(1)) : null;

  // NOTE: the export's revenue/ROAS is DASHBOARD (over-counts — includes existing/re-engaged users'
  // orders credited to the ad). It is NOT the new-customer 귀속 ROAS. So we surface spend/installs/CAC
  // (trustworthy) + dashboard ROAS (labeled inflated). True new-customer 귀속 ROAS needs isolating the
  // revenue of users who *installed this period* via the channel (install-cohort join) — a later build.
  const channels = Object.entries(byChannel)
    .map(([source, e]) => ({
      source,
      spendUsd: Number(e.spend.toFixed(2)),
      installs: e.installs,
      cacInstallUsd: e.installs > 0 && e.spend > 0 ? Number((e.spend / e.installs).toFixed(2)) : null,
      dashboardRevenueUsd: Number(e.gmvUsd.toFixed(2)),
      dashboardGmvRoas: e.spend > 0 ? Number((e.gmvUsd / e.spend).toFixed(2)) : null, // 과대 — 기존고객 혼입
    }))
    .filter((c) => c.spendUsd > 0) // paid channels only (organic has no cost)
    .sort((a, b) => b.spendUsd - a.spendUsd);

  const totalSpend = channels.reduce((s, c) => s + c.spendUsd, 0);
  const totalInstalls = channels.reduce((s, c) => s + c.installs, 0);

  return {
    month: yyyyMm,
    takeRatePct,
    breakEvenGmvRoas,
    totals: {
      spendUsd: Number(totalSpend.toFixed(2)),
      installs: totalInstalls,
      cacInstallUsd: totalInstalls > 0 ? Number((totalSpend / totalInstalls).toFixed(2)) : null,
    },
    channels,
    note:
      "신뢰 지표: spendUsd·installs·cacInstallUsd(=설치당 광고비). dashboardGmvRoas는 AppsFlyer 대시보드 " +
      "귀속매출 기준으로 기존/재참여 고객 매출이 혼입돼 과대(FB가 특히). 실제 판단은 신규고객 귀속 ROAS와 " +
      "LTV/CAC로 — 신규 귀속 ROAS 자동화는 설치코호트 조인(추후 빌드) 필요. 손익분기 GMV ROAS = 1/테이크레이트.",
  };
}

const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node channel-roas.js --month=YYYY-MM");
  process.exit(1);
}
try {
  const result = analyze(monthArg);
  console.log(JSON.stringify(result, null, 2));
  fs.mkdirSync(PATHS.pipelineState, { recursive: true });
  fs.writeFileSync(`${PATHS.pipelineState}/${monthArg}-channel-roas.json`, JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
