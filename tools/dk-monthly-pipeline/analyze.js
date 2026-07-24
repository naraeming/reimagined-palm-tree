import fs from "node:fs";
import { PATHS, parseYearMonth, afRawFilePath, appDbFilePath } from "./config.js";
import { readCsvAsObjects, streamCsvRows } from "./lib/csv.js";
import { readXlsxSheet } from "./lib/xlsxReader.js";
import { writeState } from "./lib/state.js";
import { loadLedger, saveLedger, recordOrderEvent, classifySegment, setMonthTotals, computeRetention, computeLtv, computeDormant } from "./lib/userLedger.js";

// Formulas below were reverse-engineered and backtested against 2026-06's already-confirmed
// Notion numbers on 2026-07-20 (see MEMORY reference_deliveryk_marketing_data.md):
//   - AF 주문수  = rows across {installs?no, in-app-events, organic-in-app-events} x {ios, android}
//                  (all rows in these files are Event Name == "order_completed")
//   - GMV (USD)  = sum("Event Revenue USD") over those same rows — AppsFlyer already converts to
//                  USD per-event, so no separate FX table is needed (confirmed with user 2026-07-20)
//   - 신규설치    = rows across {installs, organic-installs} x {ios, android}
//   - OS 비중     = split of AF order rows by "Platform" column
//   - 앱DB 주문수 = sum(H) in app_db pivot xlsx where status column D === 6 ("배달완료") — used
//                  only for the AF-vs-appDB match-rate cross-check and 업종(category) breakdown,
//                  since app_db has no per-user id
//   - 국가/도시/언어 비중 = parsed from each order event's "Event Value" JSON field
//                  (service_country/service_city/locale)
//   - 일치율      = AF 주문수 / 앱DB 주문수
//   - 교민/여행객 세그먼트 = per-CUID tenure classification via lib/userLedger.js
//   - 5회+ 매출비중 = % of this month's GMV from CUIDs with >=5 orders this month
//
// EXTENDED METRICS (added 2026-07-21, all derivable from the raw exports we already load — no ad
// spend needed; see analyze.js additions / RUNBOOK "확장 지표"):
//   - AOV(객단가) & 유저당 GMV, OS/국가/세그먼트별
//   - 채널·매체별 획득 + 채널 품질(설치→주문 효율): from install files' "Media Source" and the
//     "Media Source" carried on each order event (attribution flows to events)
//   - 신규 vs 기존 고객: ledger min(monthsOrdered) === 이번 달 (한국어 주문유저 한정, 세그먼트와 동일 범위)
//   - 신규설치 활성화율 + 첫 주문까지 시간: order rows whose "Install Time" falls in this month
//   - 결제수단/배달유형 믹스: Event Value "payment_type"/"delivery_type"
//   - 주문 빈도 분포, 가맹점(shop_id) 집중도, 요일·시간대 패턴(베트남 UTC+7 기준)

const ORDER_EVENT_NAME = "order_completed";

function bump(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

// Parses AppsFlyer "Event Time" ("YYYY-MM-DD HH:MM:SS", UTC per the export filename) and returns
// the hour(0-23) and day-of-week(0=일) in Vietnam local time (UTC+7) — the dominant market, so
// buckets are actionable for push/promo timing. PH is UTC+8; the 1h skew is noted in the report.
function vnHourDow(eventTime) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(eventTime || "");
  if (!m) return null;
  const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const vn = new Date(utcMs + 7 * 3600 * 1000);
  return { hour: vn.getUTCHours(), dow: vn.getUTCDay() };
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

// Streams the (large, 100MB+) order-event CSVs once, accumulating every order-derived metric in a
// single pass (see file header for the full list).
async function aggregateOrders(year, month, monthKey, ledger) {
  const files = [
    { path: afRawFilePath("ios", "events", year, month), organic: false },
    { path: afRawFilePath("ios", "organicEvents", year, month), organic: true },
    { path: afRawFilePath("android", "events", year, month), organic: false },
    { path: afRawFilePath("android", "organicEvents", year, month), organic: true },
  ];
  let afOrders = 0;
  let gmvUsd = 0;
  let iosOrders = 0;
  let androidOrders = 0;
  let gmvIos = 0;
  let gmvAndroid = 0;
  const byCountry = {};
  const byCity = {};
  const byLocale = {};
  const countryGmv = {};
  const cityGmv = {};
  const perCuidThisMonth = new Map();

  // extended accumulators
  const ordersBySource = {};
  const gmvBySource = {};
  const paymentByType = {};
  const paymentGmvByType = {};
  const deliveryByType = {};
  const shopOrders = {};
  const shopGmv = {};
  const hourCount = new Array(24).fill(0);
  const dowCount = new Array(7).fill(0);
  // activation: users whose Install Time is in this month (from the order rows themselves)
  const newInstallerFirstOrder = new Map(); // AppsFlyer ID -> { installMs, firstOrderMs }
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  for (const { path: f, organic } of files) {
    if (!fs.existsSync(f)) throw new Error(`Missing AF raw file: ${f} (run fetch-appsflyer.js first)`);
    await streamCsvRows(f, (r) => {
      if (r["Event Name"] !== ORDER_EVENT_NAME) return;
      const revenueUsd = parseFloat(r["Event Revenue USD"]) || 0;
      afOrders += 1;
      gmvUsd += revenueUsd;
      if (r["Platform"] === "ios") {
        iosOrders += 1;
        gmvIos += revenueUsd;
      } else if (r["Platform"] === "android") {
        androidOrders += 1;
        gmvAndroid += revenueUsd;
      }

      // channel/media source. Organic-event files -> "organic" (aligns with installsBySource's
      // organic bucket). Non-organic events with a blank source = attribution expired/unavailable
      // (returning users installed long ago) -> "미귀속".
      const source = r["Media Source"] || (organic ? "organic" : "미귀속");
      bump(ordersBySource, source);
      bump(gmvBySource, source, revenueUsd);

      let ev = null;
      try {
        ev = JSON.parse(r["Event Value"]);
      } catch {
        /* a few rows have malformed/empty Event Value; skip the breakdown-only fields */
      }
      if (ev) {
        bump(byCountry, ev.service_country || "(미상)");
        bump(byCity, ev.service_city || "(미상)");
        bump(byLocale, ev.locale || "(미상)");
        bump(countryGmv, ev.service_country || "(미상)", revenueUsd);
        bump(cityGmv, ev.service_city || "(미상)", revenueUsd);
        const pay = ev.payment_type || "(미상)";
        bump(paymentByType, pay);
        bump(paymentGmvByType, pay, revenueUsd);
        bump(deliveryByType, ev.delivery_type || "(미상)");
        if (ev.shop_id) {
          bump(shopOrders, ev.shop_id);
          bump(shopGmv, ev.shop_id, revenueUsd);
        }
      }

      const t = vnHourDow(r["Event Time"]);
      if (t) {
        hourCount[t.hour] += 1;
        dowCount[t.dow] += 1;
      }

      const cuid = r["Customer User ID"];
      if (cuid) {
        const cur = perCuidThisMonth.get(cuid) || { count: 0, revenueUsd: 0 };
        cur.count += 1;
        cur.revenueUsd += revenueUsd;
        perCuidThisMonth.set(cuid, cur);
        recordOrderEvent(ledger, { cuid, installTime: r["Install Time"], eventTime: r["Event Time"], locale: ev?.locale, monthKey });
      }

      // activation: did this order come from a user who INSTALLED this month?
      const installTime = r["Install Time"] || "";
      if (installTime.slice(0, 7) === monthPrefix) {
        const key = r["AppsFlyer ID"] || cuid;
        if (key) {
          const installMs = Date.parse(installTime.replace(" ", "T") + "Z");
          const eventMs = Date.parse((r["Event Time"] || "").replace(" ", "T") + "Z");
          const prev = newInstallerFirstOrder.get(key);
          if (!prev) {
            newInstallerFirstOrder.set(key, { installMs, firstOrderMs: eventMs });
          } else if (Number.isFinite(eventMs) && eventMs < prev.firstOrderMs) {
            prev.firstOrderMs = eventMs;
          }
        }
      }
    });
  }
  return {
    afOrders, gmvUsd, iosOrders, androidOrders, gmvIos, gmvAndroid,
    byCountry, byCity, byLocale, countryGmv, cityGmv, perCuidThisMonth,
    ordersBySource, gmvBySource,
    paymentByType, paymentGmvByType, deliveryByType, shopOrders, shopGmv,
    hourCount, dowCount, newInstallerFirstOrder,
  };
}

function repeatCustomerGmvShare(perCuidThisMonth, threshold = 5) {
  let repeatGmv = 0;
  let totalGmv = 0;
  let repeatCustomers = 0;
  for (const { count, revenueUsd } of perCuidThisMonth.values()) {
    totalGmv += revenueUsd;
    if (count >= threshold) {
      repeatGmv += revenueUsd;
      repeatCustomers += 1;
    }
  }
  return {
    threshold,
    repeatCustomers,
    totalCustomers: perCuidThisMonth.size,
    gmvSharePct: totalGmv ? Number(((repeatGmv / totalGmv) * 100).toFixed(1)) : null,
  };
}

function segmentBreakdown(perCuidThisMonth, ledger, monthKey) {
  const totals = {
    교민: { users: 0, orders: 0, gmvUsd: 0 },
    여행객: { users: 0, orders: 0, gmvUsd: 0 },
    중간: { users: 0, orders: 0, gmvUsd: 0 },
  };
  for (const [cuid, { count, revenueUsd }] of perCuidThisMonth.entries()) {
    const entry = ledger[cuid];
    if (!entry) continue; // not a 'ko'-locale order this month -> out of scope per source methodology
    const segment = classifySegment(entry, monthKey);
    totals[segment].users += 1;
    totals[segment].orders += count;
    totals[segment].gmvUsd += revenueUsd;
  }
  return totals;
}

// 신규(이번 달이 원장상 첫 주문월) vs 기존(재주문) 고객의 주문/GMV 기여. 원장 = 한국어 주문유저 한정
// 이므로 coverage(전체 주문유저 중 원장에 잡힌 비율)를 함께 보고해 한계를 드러낸다. 누적 이력이
// 얕을수록 '신규'가 과대 계상되는 세그먼트와 동일한 주의사항이 적용된다.
function newVsReturning(perCuidThisMonth, ledger, monthKey) {
  const out = {
    new: { users: 0, orders: 0, gmvUsd: 0 },
    returning: { users: 0, orders: 0, gmvUsd: 0 },
    trackedUsers: 0,
  };
  for (const [cuid, { count, revenueUsd }] of perCuidThisMonth.entries()) {
    const entry = ledger[cuid];
    if (!entry || !entry.monthsOrdered?.length) continue;
    out.trackedUsers += 1;
    const firstMonth = entry.monthsOrdered.slice().sort()[0];
    const bucket = firstMonth === monthKey ? out.new : out.returning;
    bucket.users += 1;
    bucket.orders += count;
    bucket.gmvUsd += revenueUsd;
  }
  const totalGmv = out.new.gmvUsd + out.returning.gmvUsd;
  out.new.gmvUsd = Number(out.new.gmvUsd.toFixed(2));
  out.returning.gmvUsd = Number(out.returning.gmvUsd.toFixed(2));
  out.newGmvSharePct = totalGmv ? Number(((out.new.gmvUsd / totalGmv) * 100).toFixed(1)) : null;
  out.coveragePct = pct(out.trackedUsers, perCuidThisMonth.size);
  return out;
}

function frequencyHistogram(perCuidThisMonth) {
  const buckets = { "1": 0, "2": 0, "3-4": 0, "5+": 0 };
  for (const { count } of perCuidThisMonth.values()) {
    if (count >= 5) buckets["5+"] += 1;
    else if (count >= 3) buckets["3-4"] += 1;
    else if (count === 2) buckets["2"] += 1;
    else buckets["1"] += 1;
  }
  return buckets;
}

function shopConcentration(shopOrders, shopGmv, topN = 10) {
  const shops = Object.keys(shopGmv);
  const totalGmv = shops.reduce((s, id) => s + shopGmv[id], 0);
  const sorted = shops
    .map((id) => ({ shop: id, orders: shopOrders[id] || 0, gmvUsd: Number(shopGmv[id].toFixed(2)) }))
    .sort((a, b) => b.gmvUsd - a.gmvUsd);
  const top = sorted.slice(0, topN);
  const topGmv = top.reduce((s, x) => s + x.gmvUsd, 0);
  return {
    totalShops: shops.length,
    [`top${topN}`]: top,
    [`top${topN}GmvSharePct`]: pct(topGmv, totalGmv),
  };
}

// installsBySource across both platforms (non-organic file grouped by Media Source; organic file
// bucketed as "organic"), plus the existing per-platform organic/non-organic counts.
async function loadInstallData(year, month) {
  const counts = { ios: { organic: 0, nonOrganic: 0 }, android: { organic: 0, nonOrganic: 0 } };
  const installsBySource = {};
  for (const platform of ["ios", "android"]) {
    await streamCsvRows(afRawFilePath(platform, "installs", year, month), (r) => {
      counts[platform].nonOrganic += 1;
      bump(installsBySource, r["Media Source"] || "(미상)");
    });
    await streamCsvRows(afRawFilePath(platform, "organicInstalls", year, month), () => {
      counts[platform].organic += 1;
      bump(installsBySource, "organic");
    });
  }
  return { counts, installsBySource };
}

// Merge installs-by-source and orders/GMV-by-source into a channel-quality table. Efficiency
// (orders per 100 installs, GMV per install) proxies channel quality WITHOUT ad spend — both
// numerator and denominator are AppsFlyer-attributed to the same media source.
function channelQuality(installsBySource, ordersBySource, gmvBySource) {
  const sources = new Set([...Object.keys(installsBySource), ...Object.keys(ordersBySource)]);
  const rows = [];
  for (const s of sources) {
    const installs = installsBySource[s] || 0;
    const orders = ordersBySource[s] || 0;
    const gmv = gmvBySource[s] || 0;
    rows.push({
      source: s,
      installs,
      orders,
      gmvUsd: Number(gmv.toFixed(2)),
      ordersPer100Installs: installs ? Number(((orders / installs) * 100).toFixed(1)) : null,
      gmvPerInstallUsd: installs ? Number((gmv / installs).toFixed(2)) : null,
    });
  }
  return rows.sort((a, b) => b.gmvUsd - a.gmvUsd);
}

function loadAppDb(month) {
  const filePath = appDbFilePath(month);
  if (!fs.existsSync(filePath)) return null;
  const rows = readXlsxSheet(filePath);
  const byCountry = {};
  const byLanguage = {};
  const byCategory = {};
  // per country -> per category local-currency amount (delivered only). Local currency is constant
  // within a country, so within-country category *shares* are valid for allocating USD GMV / rates.
  const localByCountryCategory = {};
  let totalOrders = 0;
  let excludedNonDelivered = 0;
  for (const r of rows) {
    const [currency, country, language, status, category, , localAmount, count] = r;
    if (status === 6) {
      totalOrders += count || 0;
      byCountry[country] = (byCountry[country] || 0) + (count || 0);
      byLanguage[language] = (byLanguage[language] || 0) + (count || 0);
      byCategory[category] = (byCategory[category] || 0) + (count || 0);
      (localByCountryCategory[country] ||= {});
      localByCountryCategory[country][category] = (localByCountryCategory[country][category] || 0) + (Number(localAmount) || 0);
    } else {
      excludedNonDelivered += count || 0;
    }
  }
  return { totalOrders, byCountry, byLanguage, byCategory, localByCountryCategory, excludedNonDelivered };
}

// Commission rate card (confirmed with user 2026-07-21). Only VN·PH charge order commission;
// all other countries = 0. 잡화=shopping(3~7% → midpoint 5%); massage/laundry/etc = 0%.
const COMMISSION_RATES = { food: 0.07, mart: 0.03, shopping: 0.05 };
const COMMISSION_COUNTRIES = new Set(["VN", "PH"]);
// Within VN·PH, some cities/regions are run commission-free (growth areas). Keyed by country;
// values are service_city strings AS THEY APPEAR in AF Event Value (lowercase, romanized, no spaces).
// Confirmed with user 2026-07-21. 호치민(hochiminh)은 부과. 미부과 = 소규모 성장지역.
const COMMISSION_FREE_CITIES = {
  VN: new Set(["dongnai", "phutho", "binhduong"]), // 동나이·푸토·빈즈엉
  PH: new Set(["bohol"]), // 보홀
};
// City×category exceptions to the default rate card (confirmed with user 2026-07-21).
// 박닌(bacninh) 마사지는 7% 부과(기본 massage 0%). 앱DB 업종은 국가 단위라 도시×업종 GMV를 직접
// 못 구해서, 국가 평균 업종비중으로 근사 적용 — 영향은 미미(massage 전체가 GMV ~0.7%).
// 정밀화하려면 앱DB export에 도시/지역 컬럼이 필요.
const CITY_CATEGORY_OVERRIDES = [{ country: "VN", city: "bacninh", category: "massage", rate: 0.07 }];

// Estimates order-commission take-rate WITHOUT FX: within each country the app_db local-amount
// gives category shares; multiply the country's AF USD GMV by those shares to get category USD GMV,
// then apply the rate card (VN·PH only). Commission-free cities are subtracted from each country's
// charging base (city×category isn't available, so the country category-rate is applied to the
// charging portion). Blended take-rate = total commission ÷ total GMV(USD).
function estimateCommission(countryGmvUsd, cityGmvUsd, localByCountryCategory, totalGmvUsd) {
  const gmvByCategory = {};
  const perCountryRatePct = {};
  let commissionUsd = 0;
  let allocatedUsd = 0;
  for (const [country, cats] of Object.entries(localByCountryCategory || {})) {
    const localTotal = Object.values(cats).reduce((s, v) => s + v, 0);
    const gmvUsdCountry = countryGmvUsd[country] || 0;
    if (!localTotal || !gmvUsdCountry) continue;
    allocatedUsd += gmvUsdCountry;
    let countryRateWeighted = 0;
    for (const [cat, local] of Object.entries(cats)) {
      const share = local / localTotal;
      const catGmvUsd = gmvUsdCountry * share;
      gmvByCategory[cat] = (gmvByCategory[cat] || 0) + catGmvUsd;
      countryRateWeighted += share * (COMMISSION_COUNTRIES.has(country) ? (COMMISSION_RATES[cat] || 0) : 0);
    }
    if (COMMISSION_COUNTRIES.has(country)) {
      // subtract commission-free cities from the charging base
      const freeGmv = [...(COMMISSION_FREE_CITIES[country] || [])].reduce((s, c) => s + (cityGmvUsd[c] || 0), 0);
      const chargingFrac = gmvUsdCountry > 0 ? Math.max(0, (gmvUsdCountry - freeGmv) / gmvUsdCountry) : 0;
      const countryCommission = gmvUsdCountry * countryRateWeighted * chargingFrac;
      commissionUsd += countryCommission;
      perCountryRatePct[country] = Number(((countryCommission / gmvUsdCountry) * 100).toFixed(2));
    }
  }
  // City×category overrides (approximate: city GMV × country-average category share × (override−default rate))
  for (const o of CITY_CATEGORY_OVERRIDES) {
    if (!COMMISSION_COUNTRIES.has(o.country)) continue;
    if ((COMMISSION_FREE_CITIES[o.country] || new Set()).has(o.city)) continue; // free city: no commission at all
    const cats = localByCountryCategory[o.country];
    const cityG = cityGmvUsd[o.city] || 0;
    if (!cats || !cityG) continue;
    const localTotal = Object.values(cats).reduce((s, v) => s + v, 0);
    if (!localTotal) continue;
    const catShare = (cats[o.category] || 0) / localTotal;
    const estCityCatGmv = cityG * catShare;
    const defaultRate = COMMISSION_RATES[o.category] || 0;
    commissionUsd += estCityCatGmv * (o.rate - defaultRate); // add the incremental rate only
  }
  const unallocated = totalGmvUsd - allocatedUsd; // AF GMV with no app_db country match (e.g. "(미상)")
  if (unallocated > 1) gmvByCategory["(미상)"] = Number(unallocated.toFixed(2));
  for (const k of Object.keys(gmvByCategory)) gmvByCategory[k] = Number(gmvByCategory[k].toFixed(2));
  const freeCitiesList = Object.entries(COMMISSION_FREE_CITIES).flatMap(([c, s]) => [...s].map((city) => `${c}:${city}`));
  return {
    gmvByCategory,
    perCountryRatePct,
    blendedTakeRatePct: totalGmvUsd ? Number(((commissionUsd / totalGmvUsd) * 100).toFixed(2)) : null,
    estimatedCommissionUsd: Number(commissionUsd.toFixed(2)),
    breakEvenGmvRoas: commissionUsd ? Number((totalGmvUsd / commissionUsd).toFixed(1)) : null,
    commissionFreeCities: freeCitiesList.length ? freeCitiesList : "(미설정 — 목록 확정 대기)",
    note: "VN·PH만 수수료 부과(일부 도시 면제). 요율 food7/mart3/shopping5/기타0. 업종 GMV(USD)는 국가 내 앱DB 금액비중으로 AF USD GMV를 배분한 추정치.",
  };
}

function pct(part, whole) {
  return whole ? Number(((part / whole) * 100).toFixed(1)) : null;
}

// AOV(객단가) = GMV/주문수. Overall + per ordering user + OS/세그먼트/국가별.
function computeAov(gmvUsd, afOrders, orderingUsers, gmvIos, iosOrders, gmvAndroid, androidOrders, segments, countryGmv, byCountry) {
  const aovBySegment = {};
  for (const seg of Object.keys(segments)) {
    aovBySegment[seg] = segments[seg].orders ? Number((segments[seg].gmvUsd / segments[seg].orders).toFixed(2)) : null;
  }
  const byCountry_ = {};
  for (const c of Object.keys(byCountry)) {
    byCountry_[c] = byCountry[c] ? Number(((countryGmv[c] || 0) / byCountry[c]).toFixed(2)) : null;
  }
  return {
    overall: afOrders ? Number((gmvUsd / afOrders).toFixed(2)) : null,
    perOrderingUserUsd: orderingUsers ? Number((gmvUsd / orderingUsers).toFixed(2)) : null,
    byOs: {
      ios: iosOrders ? Number((gmvIos / iosOrders).toFixed(2)) : null,
      android: androidOrders ? Number((gmvAndroid / androidOrders).toFixed(2)) : null,
    },
    bySegment: aovBySegment,
    byCountry: byCountry_,
  };
}

async function analyze(yyyyMm) {
  const { year, month } = parseYearMonth(yyyyMm);

  const { counts: installs, installsBySource } = await loadInstallData(year, month);
  const totalInstalls = installs.ios.organic + installs.ios.nonOrganic + installs.android.organic + installs.android.nonOrganic;
  const organicInstalls = installs.ios.organic + installs.android.organic;
  const nonOrganicInstalls = installs.ios.nonOrganic + installs.android.nonOrganic;

  const ledger = loadLedger();
  const agg = await aggregateOrders(year, month, yyyyMm, ledger);
  // record this month's per-CUID totals into the ledger (OVERWRITE by month = idempotent on re-run)
  for (const [cuid, v] of agg.perCuidThisMonth) setMonthTotals(ledger, cuid, yyyyMm, v.count, v.revenueUsd);
  saveLedger(ledger);

  const {
    afOrders, gmvUsd, iosOrders, androidOrders, gmvIos, gmvAndroid,
    byCountry, byCity, byLocale, countryGmv, cityGmv, perCuidThisMonth,
    ordersBySource, gmvBySource,
    paymentByType, paymentGmvByType, deliveryByType, shopOrders, shopGmv,
    hourCount, dowCount, newInstallerFirstOrder,
  } = agg;

  const appDb = loadAppDb(month);
  const matchRatePct = appDb ? pct(afOrders, appDb.totalOrders) : null;
  const repeatCustomers = repeatCustomerGmvShare(perCuidThisMonth, 5);
  const segments = segmentBreakdown(perCuidThisMonth, ledger, yyyyMm);

  // ---- extended metrics ----
  const orderingUsers = perCuidThisMonth.size;
  const aov = computeAov(gmvUsd, afOrders, orderingUsers, gmvIos, iosOrders, gmvAndroid, androidOrders, segments, countryGmv, byCountry);
  // Commission / take-rate estimate (needs app_db for category shares)
  const commission = appDb ? estimateCommission(countryGmv, cityGmv, appDb.localByCountryCategory, gmvUsd) : null;
  // Retention cohorts, LTV, dormant 교민 (ledger-based, ko-scope; accuracy improves as months accumulate)
  const retention = computeRetention(ledger, yyyyMm);
  const ltv = computeLtv(ledger, yyyyMm, classifySegment, commission?.blendedTakeRatePct || 0);
  const dormant = computeDormant(ledger, yyyyMm, classifySegment, 2);

  const nvr = newVsReturning(perCuidThisMonth, ledger, yyyyMm);

  // activation
  const delaysHr = [];
  for (const { installMs, firstOrderMs } of newInstallerFirstOrder.values()) {
    if (Number.isFinite(installMs) && Number.isFinite(firstOrderMs) && firstOrderMs >= installMs) {
      delaysHr.push((firstOrderMs - installMs) / 3600000);
    }
  }
  delaysHr.sort((a, b) => a - b);
  const activation = {
    installs: totalInstalls,
    activatedInstallers: newInstallerFirstOrder.size,
    activationRatePct: pct(newInstallerFirstOrder.size, totalInstalls),
    timeToFirstOrderHours: {
      median: delaysHr.length ? Number(percentile(delaysHr, 50).toFixed(1)) : null,
      p25: delaysHr.length ? Number(percentile(delaysHr, 25).toFixed(1)) : null,
      p75: delaysHr.length ? Number(percentile(delaysHr, 75).toFixed(1)) : null,
    },
  };

  const paymentMix = Object.keys(paymentByType)
    .map((k) => ({ type: k, orders: paymentByType[k], orderSharePct: pct(paymentByType[k], afOrders), gmvUsd: Number((paymentGmvByType[k] || 0).toFixed(2)) }))
    .sort((a, b) => b.orders - a.orders);
  const deliveryMix = Object.keys(deliveryByType)
    .map((k) => ({ type: k, orders: deliveryByType[k], orderSharePct: pct(deliveryByType[k], afOrders) }))
    .sort((a, b) => b.orders - a.orders);

  const frequency = frequencyHistogram(perCuidThisMonth);
  const shops = shopConcentration(shopOrders, shopGmv, 10);
  const channels = channelQuality(installsBySource, ordersBySource, gmvBySource);
  const timing = {
    note: "베트남 현지시각(UTC+7) 기준. 필리핀은 +1h.",
    byHour: hourCount,
    byDayOfWeek: DOW_KO.map((d, i) => ({ day: d, orders: dowCount[i] })),
  };

  const result = {
    month: yyyyMm,
    installs: {
      total: totalInstalls,
      organic: organicInstalls,
      nonOrganic: nonOrganicInstalls,
      byPlatform: installs,
      bySource: installsBySource,
    },
    afOrders,
    orderingUsers, // distinct CUIDs that ordered this month (= master's 주문유저)
    gmvUsd: Number(gmvUsd.toFixed(2)),
    osShare: {
      android: { orders: androidOrders, pct: pct(androidOrders, afOrders) },
      ios: { orders: iosOrders, pct: pct(iosOrders, afOrders) },
    },
    byCountry,
    byCity,
    byLocale,
    appDb: appDb && {
      totalOrders: appDb.totalOrders,
      excludedNonDelivered: appDb.excludedNonDelivered,
      byCountry: appDb.byCountry,
      byLanguage: appDb.byLanguage,
      byCategory: appDb.byCategory,
    },
    matchRatePct,
    repeatCustomers,
    segments,
    // ---- extended (2026-07-21) ----
    aov,
    commission, // 블렌디드 테이크레이트·손익분기 GMV ROAS·업종별 GMV(USD, 추정) — appDb 있을 때만
    retention, // 첫주문월 코호트별 M+k 재주문율 (ko, 누적될수록 정확)
    ltv, // 세그먼트별 관측 누적 GMV/인 + 순 LTV(×테이크레이트)
    dormant, // 휴면 교민 수/비율 (최근 N개월 미주문)
    channels,
    newVsReturning: nvr,
    activation,
    paymentMix,
    deliveryMix,
    frequency,
    shops,
    timing,
    // NOT YET IMPLEMENTED: 매체별 대시보드/귀속 ROAS — needs the af_ads aggregate report (ad spend)
    // wired into fetch-appsflyer.js first. channels[] above gives spend-free channel *quality*
    // (설치→주문 효율) but not ROAS/CAC. See plan file.
  };

  return result;
}

const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
if (!monthArg) {
  console.error("Usage: node analyze.js --month=YYYY-MM");
  process.exit(1);
}

try {
  const result = await analyze(monthArg);
  console.log(JSON.stringify(result, null, 2));
  fs.mkdirSync(PATHS.pipelineState, { recursive: true });
  fs.writeFileSync(`${PATHS.pipelineState}/${monthArg}-analysis.json`, JSON.stringify(result, null, 2));
  writeState(monthArg, { analyzed: true, appdb_present: !!result.appDb });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
