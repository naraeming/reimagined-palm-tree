import fs from "node:fs";
import path from "node:path";
import { PATHS, parseYearMonth, afRawFilePath } from "./config.js";
import { streamCsvRows } from "./lib/csv.js";

// Channel install-cohort attribution (the "신규 귀속" / new-customer view) — the antidote to the
// dashboard ROAS inflation (which credits existing/re-engaged users to ads). Here we attribute
// revenue ONLY to users who INSTALLED this month via a given channel, joined on AppsFlyer ID
// (always present on both install and order rows; CUID is often blank at install time).
//
// Output per channel (media source): this-month installs, activated installers (placed >=1 order),
// activation %, observed cohort GMV (USD) and net LTV per install (= GMV x take-rate / installs).
//
// LIMITATION — this is the MONTH-0 cohort (orders in the install month only). Cumulative LTV needs
// streaming subsequent months' orders for the same AppsFlyer IDs; add that as raw accumulates.
// Combined with ad spend (channel-roas.js / af_ads Cost), month-0 net LTV/install ÷ CAC = the
// true (new-customer) net ROAS at month 0 — pair the two per channel for LTV/CAC.
//
// Usage: node channel-cohort.js --month=YYYY-MM

const ORDER_EVENT = "order_completed";

function loadTakeRate(yyyyMm) {
  const p = path.join(PATHS.pipelineState, `${yyyyMm}-analysis.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).commission?.blendedTakeRatePct ?? null;
}

async function build(yyyyMm) {
  const { year, month } = parseYearMonth(yyyyMm);

  // 1) AppsFlyer ID -> channel, from this month's install files; also count installs per channel.
  const afidSource = new Map();
  const installsBySource = {};
  const installFiles = [
    { platform: "ios", kind: "installs", organic: false },
    { platform: "ios", kind: "organicInstalls", organic: true },
    { platform: "android", kind: "installs", organic: false },
    { platform: "android", kind: "organicInstalls", organic: true },
  ];
  for (const f of installFiles) {
    const fp = afRawFilePath(f.platform, f.kind, year, month);
    if (!fs.existsSync(fp)) throw new Error(`Missing install file: ${fp}`);
    await streamCsvRows(fp, (r) => {
      const src = f.organic ? "organic" : r["Media Source"] || "미귀속";
      installsBySource[src] = (installsBySource[src] || 0) + 1;
      const afid = r["AppsFlyer ID"];
      if (afid) afidSource.set(afid, src);
    });
  }

  // 2) Attribute this month's orders to a channel cohort iff the orderer installed this month.
  const cohort = {}; // source -> { orderers:Set<afid>, gmv:number }
  const orderFiles = [
    afRawFilePath("ios", "events", year, month),
    afRawFilePath("ios", "organicEvents", year, month),
    afRawFilePath("android", "events", year, month),
    afRawFilePath("android", "organicEvents", year, month),
  ];
  for (const fp of orderFiles) {
    if (!fs.existsSync(fp)) throw new Error(`Missing order file: ${fp}`);
    await streamCsvRows(fp, (r) => {
      if (r["Event Name"] !== ORDER_EVENT) return;
      const afid = r["AppsFlyer ID"];
      if (!afid || !afidSource.has(afid)) return; // not a this-month installer
      const src = afidSource.get(afid);
      const c = cohort[src] || (cohort[src] = { orderers: new Set(), gmv: 0 });
      c.orderers.add(afid);
      c.gmv += parseFloat(r["Event Revenue USD"]) || 0;
    });
  }

  const takeRatePct = loadTakeRate(yyyyMm);
  const takeRate = takeRatePct != null ? takeRatePct / 100 : null;

  const channels = Object.entries(installsBySource)
    .map(([source, installs]) => {
      const c = cohort[source];
      const orderers = c ? c.orderers.size : 0;
      const gmv = c ? c.gmv : 0;
      return {
        source,
        installs,
        activatedInstallers: orderers,
        activationRatePct: installs > 0 ? Number(((orderers / installs) * 100).toFixed(1)) : null,
        cohortGmvUsd: Number(gmv.toFixed(2)),
        observedGmvPerInstallUsd: installs > 0 ? Number((gmv / installs).toFixed(2)) : null,
        netLtvPerInstallUsd: installs > 0 && takeRate != null ? Number(((gmv * takeRate) / installs).toFixed(2)) : null,
      };
    })
    .sort((a, b) => b.installs - a.installs);

  return {
    month: yyyyMm,
    basis: "설치코호트(신규 귀속) · month-0(설치월 당월 주문만) · join=AppsFlyer ID",
    takeRatePct,
    channels,
    note:
      "이 달 설치한 신규 유저에게만 매출 귀속(대시보드 착시 제거). netLtvPerInstall = 관측 cohort GMV × " +
      "테이크레이트 ÷ 설치수 (month-0). 광고비(af_ads)와 결합 시: CAC=광고비/설치, LTV/CAC(month-0)=netLtvPerInstall/CAC. " +
      "누적 LTV는 다음 달 이후 같은 AppsFlyer ID의 주문을 더해 확장(향후).",
  };
}

const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node channel-cohort.js --month=YYYY-MM");
  process.exit(1);
}
try {
  const result = await build(monthArg);
  console.log(JSON.stringify(result, null, 2));
  fs.mkdirSync(PATHS.pipelineState, { recursive: true });
  fs.writeFileSync(`${PATHS.pipelineState}/${monthArg}-channel-cohort.json`, JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
