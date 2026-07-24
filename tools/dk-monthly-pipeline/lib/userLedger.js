import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../config.js";

// Persisted per-CUID activity ledger, used to classify 교민(resident)/여행객(traveler) the same
// way the original analysis did (see project_deliveryk_pipeline_automation memory + the
// "월간 Raw 데이터 분석 원본" Google Sheet, sheet "4.여행객vs교민", confirmed with user 2026-07-20):
//   교민 = 활동(첫~마지막 주문) 45일 이상 OR 3개월 연속 주문 OR 설치 후 180일 이상
//   여행객 = 활동 14일 이하 AND 이번이 유일한 주문월 AND 설치 30일 미만(신규)
//   그 외 = 중간/판별보류
// Classification is 한국어 주문유저 한정(locale === 'ko') per the same source.
//
// Because 교민/여행객 depends on multi-month history (install date, order months seen so far),
// this is accumulated incrementally across pipeline runs rather than recomputed from scratch
// each month — the ledger only grows as more months are processed. Early on (few months of
// ledger history), "3개월 연속"/tenure-based classification will under-count 교민 for genuinely
// long-tenured users the pipeline hasn't seen order in 3 straight processed months yet; accuracy
// improves as the ledger accumulates. Backfilling from already-downloaded past months' raw CSVs
// (see backfillMonth in analyze.js) mitigates this for the months we already have locally.

const LEDGER_PATH = path.join(PATHS.pipelineState, "user-ledger.json");

export function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return {};
  return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
}

export function saveLedger(ledger) {
  fs.mkdirSync(PATHS.pipelineState, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger));
}

/** Updates (mutates) `ledger` in place from one order event. Call once per order_completed row. */
export function recordOrderEvent(ledger, { cuid, installTime, eventTime, locale, monthKey }) {
  if (!cuid || locale !== "ko") return;
  const installMs = Date.parse(installTime);
  const eventMs = Date.parse(eventTime);
  if (!Number.isFinite(eventMs)) return;

  let entry = ledger[cuid];
  if (!entry) {
    entry = { installTime: Number.isFinite(installMs) ? installMs : eventMs, firstOrderTime: eventMs, lastOrderTime: eventMs, monthsOrdered: [], revenueByMonth: {}, ordersByMonth: {} };
    ledger[cuid] = entry;
  }
  if (Number.isFinite(installMs)) entry.installTime = Math.min(entry.installTime, installMs);
  entry.firstOrderTime = Math.min(entry.firstOrderTime, eventMs);
  entry.lastOrderTime = Math.max(entry.lastOrderTime, eventMs);
  if (!entry.monthsOrdered.includes(monthKey)) entry.monthsOrdered.push(monthKey);
}

/** Sets a CUID's total orders/revenue for `monthKey` (OVERWRITE, so re-running a month is
 * idempotent — never double-counts). Call once per ordering CUID after streaming the month.
 * Only updates CUIDs already in the ledger (ko-locale scope, same as recordOrderEvent). */
export function setMonthTotals(ledger, cuid, monthKey, orders, revenueUsd) {
  const entry = ledger[cuid];
  if (!entry) return;
  (entry.ordersByMonth ||= {})[monthKey] = orders;
  (entry.revenueByMonth ||= {})[monthKey] = revenueUsd;
}

function sumVals(obj) {
  return Object.values(obj || {}).reduce((s, v) => s + (v || 0), 0);
}

/** Cohort retention by first-order month: for each cohort, the % of its users who also ordered
 * in each subsequent month (offset 1,2,...). Only cohorts up to `monthKey` are included. */
export function computeRetention(ledger, monthKey, maxOffset = 6) {
  const cohorts = {}; // cohortMonth -> { size, retained: {offset: count} }
  for (const entry of Object.values(ledger)) {
    const months = (entry.monthsOrdered || []).slice().sort();
    if (!months.length) continue;
    const first = months[0];
    if (first > monthKey) continue;
    (cohorts[first] ||= { size: 0, retained: {} });
    cohorts[first].size += 1;
    for (const m of months) {
      const off = monthDiff(first, m);
      if (off > 0 && off <= maxOffset) cohorts[first].retained[off] = (cohorts[first].retained[off] || 0) + 1;
    }
  }
  // to retention rates
  const out = {};
  for (const [c, { size, retained }] of Object.entries(cohorts)) {
    const rates = {};
    for (let k = 1; k <= maxOffset; k++) {
      // only meaningful if cohort month + k <= monthKey (elapsed)
      if (monthDiff(c, monthKey) >= k) rates[`M+${k}`] = size ? Number(((retained[k] || 0) / size * 100).toFixed(1)) : null;
    }
    out[c] = { cohortSize: size, retentionPct: rates };
  }
  return out;
}

/** Segment LTV = observed cumulative GMV per user (over processed months so far), plus net LTV
 * (× take-rate). Labeled "observed" because it grows toward true lifetime as months accumulate. */
export function computeLtv(ledger, monthKey, classify, takeRatePct) {
  const seg = { 교민: { users: 0, gmv: 0, orders: 0 }, 여행객: { users: 0, gmv: 0, orders: 0 }, 중간: { users: 0, gmv: 0, orders: 0 } };
  for (const entry of Object.values(ledger)) {
    if (!(entry.monthsOrdered || []).length) continue;
    const s = classify(entry, monthKey);
    seg[s].users += 1;
    seg[s].gmv += sumVals(entry.revenueByMonth);
    seg[s].orders += sumVals(entry.ordersByMonth);
  }
  const out = {};
  const t = (takeRatePct || 0) / 100;
  for (const [k, v] of Object.entries(seg)) {
    out[k] = {
      users: v.users,
      observedLtvUsd: v.users ? Number((v.gmv / v.users).toFixed(2)) : null,
      netLtvUsd: v.users ? Number(((v.gmv / v.users) * t).toFixed(2)) : null,
      avgOrders: v.users ? Number((v.orders / v.users).toFixed(1)) : null,
    };
  }
  return out;
}

/** Count of 교민-classified users who haven't ordered in the last `dormantMonths` months. */
export function computeDormant(ledger, monthKey, classify, dormantMonths = 2) {
  const monthEndMs = Date.parse(`${monthsBack(monthKey, -1)}-01T00:00:00Z`) - 1;
  const cutoff = monthEndMs - dormantMonths * 30 * DAY_MS;
  let dormant = 0;
  let total교민 = 0;
  for (const entry of Object.values(ledger)) {
    if (!(entry.monthsOrdered || []).length) continue;
    if (classify(entry, monthKey) !== "교민") continue;
    total교민 += 1;
    if (entry.lastOrderTime < cutoff) dormant += 1;
  }
  return { total교민, dormant, dormantPct: total교민 ? Number(((dormant / total교민) * 100).toFixed(1)) : null, dormantMonths };
}

function monthDiff(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function monthsBack(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Classifies a CUID's segment as of the end of `monthKey`, using its ledger entry. */
export function classifySegment(entry, monthKey) {
  const monthEndMs = Date.parse(`${monthsBack(monthKey, -1)}-01T00:00:00Z`) - 1;
  const activityDays = (entry.lastOrderTime - entry.firstOrderTime) / DAY_MS;
  const daysSinceInstall = (monthEndMs - entry.installTime) / DAY_MS;
  const consecutive3 = [0, 1, 2].every((n) => entry.monthsOrdered.includes(monthsBack(monthKey, n)));
  const singleMonth = entry.monthsOrdered.length === 1 && entry.monthsOrdered[0] === monthKey;

  if (activityDays >= 45 || consecutive3 || daysSinceInstall >= 180) return "교민";
  if (activityDays <= 14 && singleMonth && daysSinceInstall < 30) return "여행객";
  return "중간";
}
