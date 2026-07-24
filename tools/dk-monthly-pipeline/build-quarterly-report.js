import fs from "node:fs";
import path from "node:path";
import { PATHS, DK_MONTHLY_ROOT, parseYearMonth, quarterForMonth, quarterMonthRange, lastDayOfMonth } from "./config.js";
import { readCsvAsObjects } from "./lib/csv.js";
import { writeXlsx } from "./lib/xlsxWriter.js";

// Generates the quarterly analysis report workbook (배달K_마케팅분석리포트_<범위>.xlsx) by
// aggregating the monthly analysis JSONs of the quarter. 8-sheet structure:
// 1.요약 / 2.앱DB_vs_AppsFlyer / 3.OS·국가·언어 / 4.여행객vs교민 / 5.채널(+매체별 품질) /
// 6.고객행동·획득(AOV·신규vs기존·활성화·빈도) / 7.캠페인 ROAS / 8.주문패턴·운영(결제·배달·가맹점·시간대).
// (원래 1~5,7 6개 시트 + 2026-07-21에 6·8 확장 시트 추가.)
//
// Auto-invoked by update-local-files.js on quarter-end months (3/6/9/12); can also be run directly.
// Styling is not reproduced (writeXlsx is a minimal writer) — layout/columns match, formatting doesn't.
//
// CAVEATS baked into the output as notes:
//  - 7.캠페인 ROAS: needs the af_ads aggregate report wired in; left as a header + note until then.
//  - 4.여행객vs교민: segment accuracy improves as the CUID ledger accumulates months.
//  - Missing months (e.g. April raw lost) are listed in 1.요약 and excluded from sums.

function loadMonthlyAnalyses(year, quarter) {
  const { startMonth, endMonth } = quarterMonthRange(year, quarter);
  const found = [];
  const missing = [];
  for (let m = startMonth; m <= endMonth; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const p = path.join(PATHS.pipelineState, `${key}-analysis.json`);
    if (fs.existsSync(p)) found.push({ key, month: m, data: JSON.parse(fs.readFileSync(p, "utf8")) });
    else missing.push(key);
  }
  return { found, missing };
}

function sumMaps(objs) {
  const out = {};
  for (const o of objs) for (const [k, v] of Object.entries(o || {})) out[k] = (out[k] || 0) + v;
  return out;
}

function pctRows(map, total) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, v, total ? Number(((v / total) * 100).toFixed(1)) : null]);
}

function build(year, quarter, { allowIncomplete = false, outPath: outPathOverride = null } = {}) {
  const { found, missing } = loadMonthlyAnalyses(year, quarter);
  if (found.length === 0) throw new Error(`No monthly analysis JSONs found for ${year} Q${quarter}. Run analyze.js for its months first.`);
  // Guard: refuse to (over)write a quarterly report from an incomplete quarter unless explicitly
  // allowed. This prevents clobbering a hand-curated / confirmed-numbers report with a partial
  // auto-generated one (learned the hard way on 2026-07-21 with April raw missing from Q2).
  if (missing.length > 0 && !allowIncomplete) {
    throw new Error(
      `Quarter ${year} Q${quarter} is missing months: ${missing.join(", ")}. ` +
        `Refusing to write a partial report (would risk overwriting a curated file). ` +
        `Pass allowIncomplete=true (or --allow-incomplete) to force.`
    );
  }

  const months = found.map((f) => f.data);
  const last = months[months.length - 1]; // ledger-cumulative metrics (retention/ltv/dormant) use latest month
  const afOrders = months.reduce((s, m) => s + (m.afOrders || 0), 0);
  const gmvUsd = months.reduce((s, m) => s + (m.gmvUsd || 0), 0);
  const installs = months.reduce((s, m) => s + (m.installs?.total || 0), 0);
  const organic = months.reduce((s, m) => s + (m.installs?.organic || 0), 0);
  const nonOrganic = months.reduce((s, m) => s + (m.installs?.nonOrganic || 0), 0);
  const appDbTotal = months.reduce((s, m) => s + (m.appDb?.totalOrders || 0), 0);
  const androidOrders = months.reduce((s, m) => s + (m.osShare?.android?.orders || 0), 0);
  const iosOrders = months.reduce((s, m) => s + (m.osShare?.ios?.orders || 0), 0);
  const matchRate = appDbTotal ? Number(((afOrders / appDbTotal) * 100).toFixed(1)) : null;

  const afByCountry = sumMaps(months.map((m) => m.byCountry));
  const afByCity = sumMaps(months.map((m) => m.byCity));
  const afByLocale = sumMaps(months.map((m) => m.byLocale));
  const appDbByCountry = sumMaps(months.map((m) => m.appDb?.byCountry));
  const appDbByCategory = sumMaps(months.map((m) => m.appDb?.byCategory));

  const seg = { 교민: { users: 0, orders: 0, gmvUsd: 0 }, 여행객: { users: 0, orders: 0, gmvUsd: 0 }, 중간: { users: 0, orders: 0, gmvUsd: 0 } };
  for (const m of months)
    for (const k of Object.keys(seg)) {
      seg[k].users += m.segments?.[k]?.users || 0;
      seg[k].orders += m.segments?.[k]?.orders || 0;
      seg[k].gmvUsd += m.segments?.[k]?.gmvUsd || 0;
    }
  const segGmvTotal = seg.교민.gmvUsd + seg.여행객.gmvUsd + seg.중간.gmvUsd;

  // ---- extended-metric aggregations (2026-07-21) ----
  const aovOverall = afOrders ? Number((gmvUsd / afOrders).toFixed(2)) : null;
  // OS AOV: reconstruct quarterly = Σ(monthly AOV × monthly OS orders) / Σ(OS orders) = Σgmv_os/Σorders_os
  function osAov(os) {
    let g = 0, o = 0;
    for (const m of months) {
      const ord = m.osShare?.[os]?.orders || 0;
      const a = m.aov?.byOs?.[os];
      if (a != null) g += a * ord;
      o += ord;
    }
    return o ? Number((g / o).toFixed(2)) : null;
  }
  const segAov = (k) => (seg[k].orders ? Number((seg[k].gmvUsd / seg[k].orders).toFixed(2)) : null);
  // country GMV reconstructed from monthly AOV×orders (monthly JSON stores AOV per country, not GMV)
  const countryGmvAgg = {};
  for (const m of months) {
    const bc = m.byCountry || {};
    const av = m.aov?.byCountry || {};
    for (const c of Object.keys(bc)) if (av[c] != null) countryGmvAgg[c] = (countryGmvAgg[c] || 0) + av[c] * bc[c];
  }
  // channel quality aggregated across the quarter
  const chAgg = {};
  for (const m of months)
    for (const c of m.channels || []) {
      const e = chAgg[c.source] || (chAgg[c.source] = { installs: 0, orders: 0, gmvUsd: 0 });
      e.installs += c.installs || 0;
      e.orders += c.orders || 0;
      e.gmvUsd += c.gmvUsd || 0;
    }
  const chRows = Object.entries(chAgg)
    .map(([s, e]) => [
      s,
      e.installs,
      e.orders,
      Number(e.gmvUsd.toFixed(2)),
      e.installs ? Number(((e.orders / e.installs) * 100).toFixed(1)) : null,
      e.installs ? Number((e.gmvUsd / e.installs).toFixed(2)) : null,
    ])
    .sort((a, b) => b[3] - a[3]);
  // new vs returning (orders/gmv additive; users summed = monthly new-customer counts)
  const nvr = { new: { orders: 0, gmvUsd: 0, users: 0 }, returning: { orders: 0, gmvUsd: 0, users: 0 } };
  for (const m of months)
    for (const b of ["new", "returning"]) {
      const x = m.newVsReturning?.[b];
      if (x) {
        nvr[b].orders += x.orders || 0;
        nvr[b].gmvUsd += x.gmvUsd || 0;
        nvr[b].users += x.users || 0;
      }
    }
  const nvrGmvTot = nvr.new.gmvUsd + nvr.returning.gmvUsd;
  let actInstalls = 0, actUsers = 0;
  for (const m of months) {
    actInstalls += m.activation?.installs || 0;
    actUsers += m.activation?.activatedInstallers || 0;
  }
  // payment / delivery / timing aggregates
  const payAgg = {}, delAgg = {};
  for (const m of months) {
    for (const p of m.paymentMix || []) payAgg[p.type] = (payAgg[p.type] || 0) + (p.orders || 0);
    for (const d of m.deliveryMix || []) delAgg[d.type] = (delAgg[d.type] || 0) + (d.orders || 0);
  }
  const payTotal = Object.values(payAgg).reduce((s, v) => s + v, 0);
  const delTotal = Object.values(delAgg).reduce((s, v) => s + v, 0);
  const hourAgg = new Array(24).fill(0);
  const dowAgg = new Array(7).fill(0);
  for (const m of months) {
    (m.timing?.byHour || []).forEach((v, i) => (hourAgg[i] += v || 0));
    (m.timing?.byDayOfWeek || []).forEach((d, i) => (dowAgg[i] += d.orders || 0));
  }
  // commission / take-rate (quarter) — sums monthly estimates
  let commissionUsd = 0;
  const gmvByCategoryQ = {};
  let hasCommission = false;
  for (const m of months) {
    const c = m.commission;
    if (!c) continue;
    hasCommission = true;
    commissionUsd += c.estimatedCommissionUsd || 0;
    for (const [cat, v] of Object.entries(c.gmvByCategory || {})) gmvByCategoryQ[cat] = (gmvByCategoryQ[cat] || 0) + v;
  }
  const blendedQ = hasCommission && gmvUsd ? Number(((commissionUsd / gmvUsd) * 100).toFixed(2)) : null;
  const breakEvenQ = commissionUsd ? Number((gmvUsd / commissionUsd).toFixed(1)) : null;
  const RATE_LABEL = { food: "7%", mart: "3%", shopping: "5%(잡화)", massage: "0%", laundry: "0%", etc: "0%", "(미상)": "-" };

  const { startMonth, endMonth } = quarterMonthRange(year, quarter);
  const rangeLabel = `${year}-${String(startMonth).padStart(2, "0")}~${String(endMonth).padStart(2, "0")}`;

  // ---- channel ad spend (af_ads) + new-customer cohort (channel-cohort JSONs) ----
  const takeR = blendedQ != null ? blendedQ / 100 : null;
  const adByChannel = {};
  {
    const qFrom = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const qTo = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDayOfMonth(year, endMonth)).padStart(2, "0")}`;
    let files = [];
    if (fs.existsSync(PATHS.ads)) {
      const all = fs.readdirSync(PATHS.ads).filter((f) => f.toLowerCase().endsWith(".csv"));
      files = all.filter((f) => f.includes(qFrom) && f.includes(qTo)); // full-quarter export
      if (!files.length) {
        const monthFroms = [];
        for (let m = startMonth; m <= endMonth; m++) monthFroms.push(`${year}-${String(m).padStart(2, "0")}-01`);
        files = all.filter((f) => monthFroms.some((mf) => f.includes(mf))); // monthly exports
      }
      files = files.map((f) => path.join(PATHS.ads, f));
    }
    for (const f of files) {
      for (const r of readCsvAsObjects(f)) {
        const s = r["Media source"] || "(미상)";
        const e = adByChannel[s] || (adByChannel[s] = { spend: 0, installs: 0, rev: 0 });
        e.spend += parseFloat(r["Cost"]) || 0;
        e.installs += parseFloat(r["Installs appsflyer"]) || 0;
        e.rev += parseFloat(r["Revenue ltv days cumulative appsflyer"]) || 0;
      }
    }
  }
  const cohortByChannel = {};
  for (const f of found) {
    const p = path.join(PATHS.pipelineState, `${f.key}-channel-cohort.json`);
    if (!fs.existsSync(p)) continue;
    const cj = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const c of cj.channels || []) {
      const e = cohortByChannel[c.source] || (cohortByChannel[c.source] = { installs: 0, orderers: 0, gmv: 0 });
      e.installs += c.installs || 0;
      e.orderers += c.activatedInstallers || 0;
      e.gmv += c.cohortGmvUsd || 0;
    }
  }

  // ---- Sheet 1: 요약 ----
  const s1 = [
    [`배달K 마케팅 분석 리포트 (${year} Q${quarter} · ${startMonth}~${endMonth}월) — Android+iOS 통합`],
    ["AppsFlyer 로우데이터 × 앱DB 배달완료 × 매체 광고비. 수치는 CUID/주문 기준."],
    [],
    ["데이터 규모", ""],
    ["  AF 주문(3개월 합)", afOrders],
    ["  앱DB 배달완료", appDbTotal || "(앱DB 미입력)"],
    ["  분기 GMV(USD)", Number(gmvUsd.toFixed(2))],
    ["  신규설치(오가닉/논오가닉)", `${installs} (${organic}/${nonOrganic})`],
    ["  AF 수집률", matchRate ? `${matchRate}%` : "(앱DB 필요)"],
    ["  OS 주문비중", `Android ${androidOrders} / iOS ${iosOrders}`],
    ["  분기 객단가(AOV, USD)", aovOverall ?? "-"],
    ["  객단가 iOS / Android", `${osAov("ios") ?? "-"} / ${osAov("android") ?? "-"}`],
    ["  블렌디드 테이크레이트(추정)", blendedQ != null ? `${blendedQ}%` : "(앱DB 필요)"],
    ["  손익분기 GMV ROAS", breakEvenQ ? `${breakEvenQ}배` : "-"],
    [],
    ["포함된 월", found.map((f) => f.key).join(", ")],
    ["누락된 월(합계 제외)", missing.length ? missing.join(", ") : "없음"],
    ["세그먼트 정확도 주의", "교민/여행객은 CUID 누적 이력이 쌓일수록 정확해짐(현재 이력 제한적)"],
  ];

  // ---- Sheet 2: 앱DB_vs_AppsFlyer (국가별) ----
  const s2 = [["앱DB vs AppsFlyer 주문 비교 (국가별)"], [], ["국가", "앱DB 주문", "AF 주문", "수집률(%)"]];
  const countryKeys = [...new Set([...Object.keys(appDbByCountry), ...Object.keys(afByCountry)])].sort(
    (a, b) => (appDbByCountry[b] || 0) - (appDbByCountry[a] || 0)
  );
  for (const c of countryKeys) {
    const db = appDbByCountry[c] || 0;
    const af = afByCountry[c] || 0;
    s2.push([c, db || "", af, db ? Number(((af / db) * 100).toFixed(1)) : ""]);
  }
  if (!appDbTotal) s2.push([], ["※ 앱DB 미입력 — 앱 DB 파일이 들어오면 국가별 수집률이 채워집니다."]);

  // ---- Sheet 3: OS·국가·언어 ----
  const s3 = [
    ["OS·국가·언어별 분포 (AppsFlyer 주문 기준)"],
    [],
    ["OS", "주문수", "비중(%)"],
    ["Android", androidOrders, afOrders ? Number(((androidOrders / afOrders) * 100).toFixed(1)) : null],
    ["iOS", iosOrders, afOrders ? Number(((iosOrders / afOrders) * 100).toFixed(1)) : null],
    [],
    ["서비스 국가", "주문수", "비중(%)"],
    ...pctRows(afByCountry, afOrders),
    [],
    ["주문 언어(locale)", "주문수", "비중(%)"],
    ...pctRows(afByLocale, afOrders),
    [],
    ["서비스 도시 (상위 15)", "주문수", "비중(%)"],
    ...pctRows(afByCity, afOrders).slice(0, 15),
  ];

  // ---- Sheet 4: 여행객vs교민 ----
  const s4 = [
    ["고객 세그먼트 (CUID 기준, 한국어 주문유저 한정)"],
    ["분류: 교민=활동45일↑ or 3개월연속 or 설치180일↑ / 여행객=활동14일↓·단일월·설치30일미만 / 중간=나머지"],
    [],
    ["세그먼트", "유저수", "주문수", "GMV(USD)", "매출비중(%)"],
    ["교민/장기거주", seg.교민.users, seg.교민.orders, Number(seg.교민.gmvUsd.toFixed(2)), segGmvTotal ? Number(((seg.교민.gmvUsd / segGmvTotal) * 100).toFixed(1)) : null],
    ["여행객", seg.여행객.users, seg.여행객.orders, Number(seg.여행객.gmvUsd.toFixed(2)), segGmvTotal ? Number(((seg.여행객.gmvUsd / segGmvTotal) * 100).toFixed(1)) : null],
    ["중간/판별보류", seg.중간.users, seg.중간.orders, Number(seg.중간.gmvUsd.toFixed(2)), segGmvTotal ? Number(((seg.중간.gmvUsd / segGmvTotal) * 100).toFixed(1)) : null],
    [],
    ["세그먼트 LTV (관측 누적 GMV/인, 한국어 유저 기준)", "유저수", "관측 LTV(USD)", "순 LTV(×테이크레이트)", "평균 주문수"],
    ...["교민", "여행객", "중간"].map((k) => {
      const v = last.ltv?.[k] || {};
      return [k, v.users ?? "", v.observedLtvUsd ?? "", v.netLtvUsd ?? "", v.avgOrders ?? ""];
    }),
    [],
    ["휴면 교민 (최근 " + (last.dormant?.dormantMonths ?? 2) + "개월 미주문)", `${(last.dormant?.dormant ?? 0).toLocaleString()}명 / ${last.dormant?.dormantPct ?? "-"}%`],
    [],
    ["※ 세그먼트·LTV 정확도는 CUID 누적 이력이 쌓일수록 향상됩니다. LTV는 처리된 개월만 누적한 '관측치'로, 이력이 쌓일수록 실제 생애값에 근접합니다."],
  ];

  // ---- Sheet 5: 채널 (오가닉 vs 논오가닉 / 월별 추이) ----
  const s5 = [
    ["오가닉 vs 논오가닉 / 월별 추이 (신규설치 기준)"],
    [],
    ["구분", "신규설치"],
    ["오가닉", organic],
    ["논오가닉(광고)", nonOrganic],
    [],
    ["월", "AF 주문수", "GMV(USD)", "신규설치"],
    ...found.map((f) => [f.key, f.data.afOrders, f.data.gmvUsd, f.data.installs?.total || 0]),
    [],
    ["매체별 채널 품질 (분기 합산)"],
    ["매체", "설치", "주문", "GMV(USD)", "100설치당 주문", "설치당 GMV(USD)"],
    ...chRows,
    [],
    ["※ '100설치당 주문'·'설치당 GMV'는 (이번 분기 주문 ÷ 이번 분기 설치)라 같은 코호트 전환율이 아니라"],
    ["   채널 강도/성숙도 비율. organic이 큰 이유도 기존 유저 재주문이 organic으로 잡히기 때문 — 유료채널끼리"],
    ["   상대비교(예: Google vs Facebook vs TikTok)에 사용. 'organic'=오가닉, '미귀속'=귀속 만료/부재."],
  ];

  // ---- Sheet 6: 고객행동·획득 ----
  const countryTop = countryKeys.slice(0, 8);
  const s6 = [
    ["고객 행동·획득 지표 (분기 합산)"],
    [],
    ["객단가(AOV)", "값(USD)"],
    ["  전체", aovOverall ?? "-"],
    ["  iOS", osAov("ios") ?? "-"],
    ["  Android", osAov("android") ?? "-"],
    ["  교민", segAov("교민") ?? "-"],
    ["  여행객", segAov("여행객") ?? "-"],
    ["  중간", segAov("중간") ?? "-"],
    [],
    ["국가별 객단가 (상위)", "AOV(USD)", "주문수"],
    ...countryTop.map((c) => [c, afByCountry[c] ? Number(((countryGmvAgg[c] || 0) / afByCountry[c]).toFixed(2)) : "", afByCountry[c] || 0]),
    [],
    ["신규 vs 기존 고객 (원장=한국어 유저 한정)", "주문수", "GMV(USD)", "GMV비중(%)"],
    ["  신규(원장상 첫 주문월)", nvr.new.orders, Number(nvr.new.gmvUsd.toFixed(2)), nvrGmvTot ? Number(((nvr.new.gmvUsd / nvrGmvTot) * 100).toFixed(1)) : null],
    ["  기존(재주문)", nvr.returning.orders, Number(nvr.returning.gmvUsd.toFixed(2)), nvrGmvTot ? Number(((nvr.returning.gmvUsd / nvrGmvTot) * 100).toFixed(1)) : null],
    ["  ※ 신규 고객수(월별 신규 합계)", nvr.new.users],
    ["  ※ 주의: 원장 이력이 얕으면 초기 월의 유저가 대부분 '신규'로 잡혀 신규 비중이 과대계상됨(이력 누적 시 정확해짐)"],
    [],
    ["신규설치 활성화 (월별)", "신규설치", "첫주문 전환자", "활성화율(%)", "첫주문 중앙값(시간)"],
    ...found.map((f) => [
      f.key,
      f.data.activation?.installs || 0,
      f.data.activation?.activatedInstallers || 0,
      f.data.activation?.activationRatePct ?? null,
      f.data.activation?.timeToFirstOrderHours?.median ?? null,
    ]),
    ["  분기 합계", actInstalls, actUsers, actInstalls ? Number(((actUsers / actInstalls) * 100).toFixed(1)) : null, "(월별 참고)"],
    [],
    ["주문 빈도 분포 (월별 주문유저 수)", "1회", "2회", "3-4회", "5+회"],
    ...found.map((f) => [
      f.key,
      f.data.frequency?.["1"] || 0,
      f.data.frequency?.["2"] || 0,
      f.data.frequency?.["3-4"] || 0,
      f.data.frequency?.["5+"] || 0,
    ]),
    [],
    ["리텐션 코호트 (첫 주문월 기준 재주문율, 한국어 유저)", "코호트 규모", "M+1", "M+2", "M+3"],
    ...Object.entries(last.retention || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([c, v]) => [c, v.cohortSize, v.retentionPct?.["M+1"] ?? "", v.retentionPct?.["M+2"] ?? "", v.retentionPct?.["M+3"] ?? ""]),
    ["  ※ 현재 이력이 얕아 사실상 '전월 대비 재주문율'에 가까움 — 개월 누적 시 진짜 획득 코호트 리텐션이 됩니다."],
    [],
    ["업종별 GMV(USD, 추정) 및 수수료 요율", "GMV(USD)", "비중(%)", "요율(VN·PH)"],
    ...Object.entries(gmvByCategoryQ)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, v]) => [cat, Number(v.toFixed(2)), gmvUsd ? Number(((v / gmvUsd) * 100).toFixed(1)) : null, RATE_LABEL[cat] ?? "?"]),
    [],
    ["수익성 판단 기준 (광고 ROAS 해석)"],
    ["  블렌디드 테이크레이트(추정)", blendedQ != null ? `${blendedQ}%` : "-"],
    ["  손익분기 GMV ROAS", breakEvenQ ? `${breakEvenQ}배` : "-"],
    ["  1) GMV ROAS는 거래액 기준(부풀려짐). 회사 실수익 기준 = 순 ROAS = GMV ROAS × 테이크레이트."],
    ["  2) 단건 기준 손익분기는 GMV ROAS 약 " + (breakEvenQ ?? "-") + "배. 그 아래면 첫 주문만으론 광고비 미회수."],
    ["  3) 수수료가 얇아 대부분 채널이 단건 미달 → 광고 회수는 재주문(LTV)에서 발생. 신규고객 재주문율이 핵심."],
    ["  4) 판단: ①단기 순 ROAS(지금 본전인가) ②LTV/CAC(장기 회수되나) ③채널은 상대비교(구글>메타>틱톡)."],
    ["  ※ 수수료는 VN·PH만 부과(일부 도시 면제). 업종 GMV는 국가 내 앱DB 금액비중으로 배분한 추정치."],
  ];

  // ---- Sheet 7: 채널 광고 성과 (판단축 = LTV/CAC) ----
  const adRows = Object.entries(adByChannel)
    .filter(([, e]) => e.spend > 0)
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([s, e]) => [
      s,
      Number(e.spend.toFixed(0)),
      e.installs,
      e.installs ? Number((e.spend / e.installs).toFixed(2)) : null,
      e.spend ? Number((e.rev / e.spend).toFixed(1)) : null,
    ]);
  const cohortRows = Object.entries(cohortByChannel)
    .filter(([, e]) => e.installs >= 50)
    .sort((a, b) => b[1].installs - a[1].installs)
    .map(([s, e]) => [
      s,
      e.installs,
      e.orderers,
      e.installs ? Number(((e.orderers / e.installs) * 100).toFixed(1)) : null,
      Number(e.gmv.toFixed(0)),
      e.installs && takeR ? Number(((e.gmv * takeR) / e.installs).toFixed(2)) : null,
    ]);
  const s7 = [
    ["채널 광고 성과 (판단축 = LTV/CAC — 노션 '광고 채널 평가 방법론 — LTV/CAC 기준' 페이지가 정본)"],
    [],
    ["※ ROAS로 판단하지 않음. 대시보드 ROAS는 기존/재참여 고객 매출 혼입으로 과대(참고용). 판단은 CAC·신규활성화·순LTV/설치."],
    [],
    ["[광고비 기준] 매체", "광고비(USD)", "설치", "CAC(설치당USD)", "대시보드 GMV ROAS(과대)"],
    ...(adRows.length ? adRows : [["(af_ads 광고비 CSV 없음 — data/af_ads/에 넣으면 채워짐)", "", "", "", ""]]),
    [],
    ["[신규 귀속·설치코호트] 매체", "설치", "신규 첫주문자", "신규 활성화(%)", "cohort GMV(USD)", "순LTV/설치(USD, 월0)"],
    ...(cohortRows.length ? cohortRows : [["(channel-cohort.js 산출 필요 — 그 분기 월들 실행)", "", "", "", "", ""]]),
    [],
    ["손익분기 GMV ROAS", breakEvenQ ? `${breakEvenQ}배` : "-"],
    ["※ LTV/CAC = 순LTV/설치 ÷ CAC. 순LTV/설치는 month-0(설치월 당월) 관측 — raw 누적 시 누적LTV로 확장."],
    ["※ 코호트는 raw 있는 월만 합산(4월 유실 시 제외). 크기 검증은 홀드아웃/제외타겟 실험으로."],
  ];

  // ---- Sheet 8: 주문패턴·운영 ----
  const s8 = [
    ["주문 패턴·운영 지표 (분기 합산)"],
    [],
    ["결제수단", "주문수", "비중(%)"],
    ...pctRows(payAgg, payTotal),
    [],
    ["배달유형", "주문수", "비중(%)"],
    ...pctRows(delAgg, delTotal),
    [],
    ["가맹점 집중도 (월별)", "가맹점 수", "상위10 GMV비중(%)"],
    ...found.map((f) => [f.key, f.data.shops?.totalShops || 0, f.data.shops?.top10GmvSharePct ?? null]),
    [],
    ["요일별 주문 (베트남 UTC+7 기준)", "주문수", "비중(%)"],
    ...["일", "월", "화", "수", "목", "금", "토"].map((d, i) => [d, dowAgg[i], afOrders ? Number(((dowAgg[i] / afOrders) * 100).toFixed(1)) : null]),
    [],
    ["시간대별 주문 (0~23시, VN 기준)", "주문수"],
    ...hourAgg.map((v, i) => [`${i}시`, v]),
  ];

  const sheets = [
    { name: "1.요약", rows: s1 },
    { name: "2.앱DB_vs_AppsFlyer", rows: s2 },
    { name: "3.OS·국가·언어", rows: s3 },
    { name: "4.여행객vs교민", rows: s4 },
    { name: "5.채널", rows: s5 },
    { name: "6.고객행동·획득", rows: s6 },
    { name: "7.채널 광고성과", rows: s7 },
    { name: "8.주문패턴·운영", rows: s8 },
  ];

  const outPath = outPathOverride || path.join(DK_MONTHLY_ROOT, `배달K_마케팅분석리포트_${rangeLabel}.xlsx`);
  if (fs.existsSync(outPath)) {
    const stamp = new Date();
    const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
    fs.copyFileSync(outPath, outPath.replace(/\.xlsx$/, `_backup_${ymd}.xlsx`));
  }
  writeXlsx(sheets, outPath);
  return { outPath, found: found.map((f) => f.key), missing };
}

export { build as buildQuarterlyReport };

// CLI: node build-quarterly-report.js --month=YYYY-MM  (uses the quarter containing that month)
//   or node build-quarterly-report.js --quarter=YYYY-Q  (e.g. 2026-2)
const args = process.argv.slice(2);
const monthArg = args.find((a) => a.startsWith("--month="))?.split("=")[1];
const quarterArg = args.find((a) => a.startsWith("--quarter="))?.split("=")[1];

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("build-quarterly-report.js")) {
  try {
    let year, quarter;
    if (quarterArg) {
      [year, quarter] = quarterArg.split("-").map(Number);
    } else if (monthArg) {
      const ym = parseYearMonth(monthArg);
      year = ym.year;
      quarter = quarterForMonth(ym.month);
    } else {
      console.error("Usage: node build-quarterly-report.js --month=YYYY-MM | --quarter=YYYY-Q");
      process.exit(1);
    }
    const allowIncomplete = args.includes("--allow-incomplete");
    const r = build(year, quarter, { allowIncomplete });
    console.log(`Quarterly report written: ${r.outPath}`);
    console.log(`  months included: ${r.found.join(", ")}`);
    if (r.missing.length) console.log(`  months missing (excluded): ${r.missing.join(", ")}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
