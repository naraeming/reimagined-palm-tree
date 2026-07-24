import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, parseYearMonth, dateRange, isQuarterEndMonth } from "./config.js";

// One-command monthly orchestrator: runs the full LOCAL pipeline for a month in order —
//   1) analyze.js            (raw + app_db -> metrics JSON)
//   2) channel-cohort.js     (설치코호트 신규귀속: 채널 활성화·순LTV/설치)
//   3) channel-roas.js       (af_ads 있으면: 채널 광고비·CAC·대시보드ROAS)
//   4) update-local-files.js (마스터 엑셀 upsert + 분기 마감월엔 분기 리포트)
// then prints a concise summary. Notion/Slack publishing stays manual (RUNBOOK 3~4) since it uses
// MCP tools / human review. Files must already be dropped in data/ (raw, app_db, af_ads).
//
// Usage: node run-month.js --month=YYYY-MM

const here = path.dirname(fileURLToPath(import.meta.url));
const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node run-month.js --month=YYYY-MM");
  process.exit(1);
}
const { year, month } = parseYearMonth(monthArg);

function run(script, label, { optional = false } = {}) {
  process.stdout.write(`\n> ${label} ...\n`);
  try {
    execFileSync("node", [path.join(here, script), `--month=${monthArg}`], { stdio: ["ignore", "ignore", "inherit"] });
    console.log(`  [OK] ${label}`);
    return true;
  } catch (e) {
    if (optional) {
      console.log(`  [SKIP] ${label} — ${String(e.message).split("\n")[0]}`);
      return false;
    }
    console.error(`  [FAIL] ${label}`);
    throw e;
  }
}

function hasAdFile() {
  const { from, to } = dateRange(year, month);
  if (!fs.existsSync(PATHS.ads)) return false;
  return fs.readdirSync(PATHS.ads).some((f) => f.toLowerCase().endsWith(".csv") && f.includes(from) && f.includes(to));
}

function readJson(suffix) {
  const p = path.join(PATHS.pipelineState, `${monthArg}-${suffix}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

try {
  run("analyze.js", "1) 분석 (analyze)");
  run("channel-cohort.js", "2) 채널 신규귀속 (channel-cohort)");
  if (hasAdFile()) run("channel-roas.js", "3) 채널 광고비·CAC (channel-roas)", { optional: true });
  else console.log("\n> 3) 채널 광고비·CAC — af_ads 광고비 CSV 없음 → 건너뜀 (data/af_ads/에 넣으면 포함됨)");
  run("update-local-files.js", "4) 로컬 엑셀 갱신 (+분기 마감월엔 분기 리포트)");
} catch (e) {
  console.error(`\n중단됨: ${e.message.split("\n")[0]}\n필요 파일이 data/ 폴더에 있는지 확인 후 다시 실행하세요.`);
  process.exit(1);
}

// ---- summary ----
const a = readJson("analysis");
const coh = readJson("channel-cohort");
const f = (n) => (typeof n === "number" ? n.toLocaleString() : n ?? "-");
console.log(`\n===== 요약 (${monthArg}) =====`);
if (a) {
  console.log(`신규설치 ${f(a.installs?.total)} · AF주문 ${f(a.afOrders)} · 주문유저 ${f(a.orderingUsers)} · GMV $${f(a.gmvUsd)}`);
  console.log(`일치율 ${a.matchRatePct}% · AOV $${a.aov?.overall} · 테이크레이트 ${a.commission?.blendedTakeRatePct}% · 신규 활성화 ${a.activation?.activationRatePct}%`);
}
if (coh) {
  const top = (coh.channels || [])
    .filter((c) => c.installs >= 100)
    .slice(0, 4)
    .map((c) => `${c.source} 활성화 ${c.activationRatePct}%/순LTV $${c.netLtvPerInstallUsd}`)
    .join(" · ");
  if (top) console.log(`채널(신규귀속): ${top}`);
}
console.log(`\n다음(수동): 노션 발행 [월간 리포트=확장지표+수익성+채널 / MAU·요일 DB / 리텐션(CUID)] → 슬랙 캔버스. RUNBOOK 3~4 참고.`);
if (isQuarterEndMonth(month)) console.log(`※ 분기 마감월 — 분기 리포트 + 노션 분기 종합 페이지(Q1~Q4)도 함께 작성.`);
