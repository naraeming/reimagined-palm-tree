# 배달K 월간 리포트 파이프라인 — 실행 RUNBOOK

수동 파일 전달 기반 파이프라인. AppsFlyer 자동수집(Pull API / MCP 커넥터)이 아직 안 되므로,
**사용자가 raw 파일을 폴더에 넣어주면** 그 다음 단계(분석 → 로컬 엑셀 → 노션 → 슬랙)를 실행한다.

대상 월을 `YYYY-MM`(예 `2026-07`)으로 지정한다. 아래에서 `<월>`로 표기.

---

## 0. 사전 준비 — 사용자가 넣어줄 파일

`C:\Users\Admin\Desktop\DK_monthly\data\` 아래에 그 달치를 넣는다:

- `af_ios_raw\id1456285291_installs_<월>-01_<월>-말일_UTC.csv`
- `af_ios_raw\id1456285291_organic-installs_..._UTC.csv`
- `af_ios_raw\id1456285291_in-app-events_..._UTC.csv`
- `af_ios_raw\id1456285291_organic-in-app-events_..._UTC.csv`
- `af_aos_raw\com.teamjin.deliveryk_installs_..._UTC.csv` (+ organic-installs, in-app-events, organic-in-app-events)
- `app_db\<N>월 앱 DB.xlsx` (N=월 숫자, 앞자리 0 없이)

파일명 규칙은 `config.js`의 `afRawFilePath()` / `appDbFilePath()`가 기대하는 형식과 정확히 같아야 한다.
누락 파일이 있으면 `analyze.js`가 어떤 파일이 없는지 알려주며 멈춘다.

---

## 빠른 실행 (원클릭)

파일 드롭 후 한 번에 1~4단계(분석·채널 신규귀속·채널 광고비/CAC·로컬 엑셀+분기)를 실행:

```bash
cd tools/dk-monthly-pipeline
node run-month.js --month=<월>
```

끝에 요약을 출력하고, 그 뒤 노션·슬랙 발행(3~4단계)만 수동으로 하면 된다. 아래는 각 단계 상세.

## 1. 분석

```bash
cd tools/dk-monthly-pipeline
node analyze.js --month=<월>
```

- 결과가 콘솔에 JSON으로 출력되고, `data\.pipeline-state\<월>-analysis.json`에 저장된다.
- 앱 DB 파일이 아직 없으면 `appDb: null`로 나온다(그 상태로도 AF 지표는 산출됨). 앱 DB가 들어온 뒤
  다시 실행하면 일치율·업종 분포까지 채워진다.
- **검증 습관**: 신규설치/주문유저/앱DB 주문수가 상식 범위인지, GMV가 전월과 급격히 다르지 않은지 눈으로 확인.

산출 필드 요약: `installs`(total/organic/nonOrganic/byPlatform/**bySource**), `afOrders`, `orderingUsers`,
`gmvUsd`, `osShare`, `byCountry/byCity/byLocale`, `appDb`(있으면), `matchRatePct`,
`repeatCustomers`(5회+ 매출비중), `segments`(교민/여행객/중간).

**확장 지표 (2026-07-21 추가, 광고비 없이 원본만으로 산출)**:
- `aov` — 객단가(GMV/주문). `overall`, `perOrderingUserUsd`(유저당 GMV), `byOs`(iOS/AOS), `bySegment`(교민/여행객/중간), `byCountry`.
- `channels[]` — 매체별 `installs`/`orders`/`gmvUsd` + **채널 품질** `ordersPer100Installs`, `gmvPerInstallUsd`. GMV순 정렬. 유료채널 상대비교용(예: Google vs Facebook vs TikTok).
- `newVsReturning` — 신규(이번 달 첫 주문월)/기존 유저의 users·orders·gmvUsd, `newGmvSharePct`, `coveragePct`(원장에 잡힌 비율).
- `activation` — `activationRatePct`(이번 달 신규설치 중 첫 주문한 비율), `timeToFirstOrderHours`(median/p25/p75).
- `paymentMix[]` / `deliveryMix[]` — 결제수단·배달유형별 주문/비중(+결제는 gmvUsd).
- `frequency` — 주문 빈도 히스토그램(1/2/3-4/5+회 유저 수).
- `shops` — `totalShops`, `top10`(주문·GMV), `top10GmvSharePct`(상위10 가맹점 GMV 집중도).
- `timing` — 요일·시간대 주문 분포(**베트남 UTC+7 기준**, 필리핀 +1h).

⚠️ **채널 지표 해석 주의**: `ordersPer100Installs`/`gmvPerInstallUsd`는 "이번 달 주문 ÷ 이번 달 설치"(같은 매체)라
같은 코호트의 전환율이 아니라 **채널 강도/성숙도 비율**이다(이번 달 주문에는 과거에 설치한 유저의 재주문도 포함).
`organic` 값이 유독 큰 이유(설치당 주문 수백 건)도 이 때문 — 기존 유저 베이스 전체가 organic으로 귀속됨.
**유료 채널끼리 상대 비교**(Google > Facebook > TikTok 식)에 쓰고, 절대 전환율로 읽지 말 것. `미귀속` = 논오가닉
이벤트인데 매체 귀속이 만료/부재한 유저(과거 설치 재주문).

⚠️ **세그먼트 정확도 주의**: 교민/여행객은 누적 이력이 쌓일수록 정확해진다(현재 몇 달치만 있어 교민 비중이
실제보다 낮게 나옴). 여러 달 raw를 순서대로 `analyze.js` 돌리면 `data\.pipeline-state\user-ledger.json`이
누적된다. 리포트에 세그먼트 수치를 실을 땐 이 한계를 감안.
- 원장은 이제 CUID별 **월별 누적 매출/주문(revenueByMonth/ordersByMonth)** 도 기록한다 → 리텐션 코호트·세그먼트 LTV·휴면 교민
  계산에 쓰임. 월별 값은 **덮어쓰기(overwrite)** 라 같은 달을 다시 돌려도 이중집계 안 됨(멱등). 단, 리텐션/LTV는 여러 달이
  원장에 있어야 의미 있으므로 **분기 리포트 전엔 그 분기 월들을 순서대로 `analyze.js` 재실행**해 원장을 채운 뒤 생성할 것.
  (analyze.js에 원장기반 지표를 새로 추가한 뒤에도 과거 월 재실행 필요 — 안 하면 그 달 값이 0으로 빠짐.)

---

## 1.5 채널 광고 성과 (광고비 CSV가 있을 때)

AppsFlyer "platform-table unified view" 광고비 export(USD)를 `data\af_ads\`에 넣는다(파일명에 그 달
날짜범위 `YYYY-MM-01__YYYY-MM-말일` 포함되면 자동 인식). 그다음:

```bash
node channel-roas.js --month=<월>     # 채널별 광고비·설치·CAC(+대시보드 ROAS, 과대라 라벨링)
node channel-cohort.js --month=<월>   # 설치코호트 신규귀속: 채널별 신규 활성화율·순LTV/설치(month-0)
```

**판단 방법론(요약) — 노션 "광고 채널 평가 방법론 — LTV/CAC 기준" 페이지가 정본:**
- ROAS로 판단하지 않는다. 이유: ①수수료 얇음(손익분기 GMV ROAS≈19배) ②가치는 재주문(LTV)에서 ③대시보드 귀속 과대(기존고객 혼입).
- 판단축 = **채널별 LTV/CAC + 회수기간**. 계산: CAC=광고비÷설치, 순매출=GMV×테이크레이트(~5.3%), 순ROAS=GMV ROAS×테이크레이트, LTV/CAC=순LTV(1인)÷CAC.
- **대시보드 ROAS(channel-roas.js)는 참고용**(메타 109배 착시). **신규 귀속(channel-cohort.js)** 이 진짜 신규 성과.
- 크기는 **홀드아웃/제외타겟 실험**으로 검증. 큰 채널(메타)부터 분기 1회.
- LTV 이력이 짧은 동안엔 **CAC + M1 리텐션**을 LTV 선행지표로 사용.

## 2. 로컬 엑셀 갱신 (매월 마스터 + 분기 마감월엔 분기 리포트)

```bash
node update-local-files.js --month=<월>
```

- **매월**: `배달K_누적마스터_월별집계.xlsx`의 **1.월별요약** 시트에 그 달 행을 upsert(있으면 갱신, 없으면 추가).
  실행 전 자동 백업(`..._backup_<YYYYMMDD>.xlsx`), 다른 시트/서식/차트 보존.
- **분기 마감월(3·6·9·12월)만**: 위에 이어서 자동으로 분기 분석 리포트
  `배달K_마케팅분석리포트_<범위>.xlsx`를 생성(8개 시트: 1.요약 / 2.앱DB_vs_AppsFlyer /
  3.OS·국가·언어 / 4.여행객vs교민 / 5.채널(+매체별 품질) / 6.고객행동·획득(AOV·신규vs기존·활성화·빈도) /
  7.채널 광고성과(광고비·CAC·대시보드ROAS + 신규귀속 활성화·순LTV/설치) / 8.주문패턴·운영(결제·배달·가맹점·요일/시간대)).
  그 분기 3개월의 분석 JSON + af_ads 광고비 + channel-cohort JSON을 합산.
  - **안전장치**: 분기 3개월 중 빠진 달이 있으면 (예: raw 유실) 부분 리포트로 기존 파일을 덮어쓰지 않도록
    거부한다. 의도적으로 강행하려면 `node build-quarterly-report.js --quarter=<YYYY-Q> --allow-incomplete`.
  - 분기 리포트만 따로 만들려면: `node build-quarterly-report.js --quarter=2026-2` (또는 `--month=<월>`).
- (미구현) 마스터의 국가·언어·세그먼트·ROAS 시트 자동갱신, 분기 리포트의 7.캠페인 ROAS 시트
  (af_ads 집계 연동 필요 — 현재는 안내 문구만 채워짐).

---

## 3. 노션 갱신 (MCP 도구로 직접 수행 — 스크립트 아님)

`data\.pipeline-state\<월>-analysis.json`을 읽어서 아래를 수행한다.

### 3a. 월간 리포트 DB에 행 추가/갱신
- 데이터소스: `collection://baa74b3a-7add-4601-ae36-2b2bd433a59b`
  (DB "마케팅 데이터 리포트 (월간·분기)", 부모 = "성과·유저 분석" 허브)
- 먼저 `notion-query-data-sources`로 그 달 행이 이미 있는지 확인(리포트명 `"<월> 월간 리포트"`).
- 없으면 `notion-create-pages`로 새 페이지(행) 생성, 있으면 `notion-update-page`로 갱신.
- 속성 매핑 (분석 JSON → 노션 속성):
  | 노션 속성 | 값 |
  |---|---|
  | `리포트` (title) | `"<월> 월간 리포트"` |
  | `date:기준월:start` | `<월>-01`, `is_datetime`=0 |
  | `AF 주문수` | `afOrders` |
  | `앱DB 주문수` | `appDb.totalOrders` |
  | `GMV (USD)` | `gmvUsd` |
  | `주문 일치율(%)` | `matchRatePct` |
  | `오가닉 비중(%)` | `installs.organic / installs.total * 100` (설치 기준) |
  | `오가닉 설치` / `논오가닉 설치` | `installs.organic` / `installs.nonOrganic` |
  | `iOS 주문비중(%)` | `osShare.ios.pct` |
  | `교민 비중(%)` | `segments.교민.gmvUsd / (전체 segments gmv 합) * 100` |
  | `5회+ 매출비중(%)` | `repeatCustomers.gmvSharePct` |
  | `월간 활성유저(MAU)` | **수동 입력** (AppsFlyer 30일 활성유저; raw로 자동계산 불가) |
  | `핵심 요약` (text) | 아래 톤으로 2~4문장 요약 |

### 3b. 상세 리포트 페이지 본문
- 기존 "2026-06 월간 리포트" 페이지 구조를 템플릿으로 사용(진단 → 읽는 법 → 한눈 요약 → OS·국가 분포 →
  오가닉/논오가닉 → 확장 지표 → 변경·점검·특이사항 → 용어 → 주의사항).
- **문체 규칙(2026-07-21 확정, 월간·분기 공통)**: **이모티콘/이모지 사용 금지**. 표 아래 코멘트는 `👉` 대신
  **"해석 —"** 볼드 라인으로. 짧고 명확한 문장, 군더더기 제거, 숫자는 천단위 콤마. 달러는 `\$`로 escape(수식 방지).
  섹션 제목은 이모지 없는 텍스트. 재작성된 2026-06 페이지가 표준 예시.
- **확장 지표 섹션 추가**(analyze JSON의 새 필드 활용): ① 객단가(AOV)와 유저당 GMV(전월 대비), ② 채널 품질 —
  유료 매체별 설치당 GMV/주문 비교(Google/Facebook/TikTok 등, 위 해석 주의 반영), ③ 신규 vs 기존 고객 매출 기여,
  ④ 신규설치 활성화율·첫 주문까지 시간, ⑤ 결제수단·배달유형 믹스, ⑥ 주문 빈도 분포·가맹점 집중도·요일/시간대 피크,
  ⑦ **수익성 판단 기준** — 업종별 GMV + 블렌디드 테이크레이트(`commission.blendedTakeRatePct`, ~5.3%)·손익분기 GMV
  ROAS(`breakEvenGmvRoas`, ~19배)·순 ROAS(=GMV ROAS×테이크레이트) + "광고 회수는 단건이 아니라 재주문(LTV)"
  프레이밍. 채널 ROAS 수치를 실을 땐 반드시 이 순 ROAS/손익분기 해석과 LTV/CAC 관점을 같이 붙일 것.
  ⑧ **리텐션·LTV·국가** — `retention`(첫주문월 코호트별 M+k 재주문율), `ltv`(세그먼트별 observedLtvUsd/netLtvUsd/avgOrders),
  `dormant`(휴면 교민 수·%), 국가(VN vs PH) 주문비중·AOV 비교. 리텐션엔 "이력 얕으면 사실상 전월대비 재주문율" 주의,
  LTV엔 "관측 누적치(개월 쌓일수록 실제 생애값 근접)" 주의 문구 필수.
  수치는 반드시 "해석 —" 액션 한 줄과 함께(이모지 금지, 문체 규칙 참고).
- **채널 성과 섹션**(광고비 있을 때): channel-cohort.js 산출(채널별 신규 활성화·순LTV/설치) + channel-roas.js의 CAC를
  표로. ROAS 아닌 CAC·활성화·순LTV/설치로 서술하고, 대시보드 ROAS는 "참고·과대"로만. "광고 채널 평가 방법론" 페이지 링크.
- ⚠️ Event Value의 `coupon`/`coupon_used` 필드는 **리포트에 쓰지 않는다** — 6월 조사 결과 마케팅 쿠폰 캠페인이
  아니라 주문 건별 일련번호(바우처/할인, 출처 미상, 주문의 1.6%·거의 VN)로 확인됨. 정체가 확인되기 전엔 지표화 금지.
- 분기 마감월(3·6·9·12월)이면 분기 종합 페이지도 **Q1~Q4 표준 명칭**으로 추가 작성
  (`project-deliveryk-quarter-convention` 메모리 참고). 롤링(예 "3~5월") 방식 쓰지 말 것.

### 3c. MAU 추세 DB
- 데이터소스: `collection://0cd196d1-dc14-4270-bb9d-5ca05b02674a`
- MAU는 수동 확인값. 확보되면 그 달 행 추가(월, MAU, 전월대비%, 주문 고유유저=`orderingUsers`,
  MAU 대비 주문전환% = `orderingUsers/MAU*100`, 비고).

---

## 4. 슬랙 캔버스 갱신

- 채널: `#general_marketing` (배달K 마케팅, 비공개, id `C0BFHPUUMRT`).
- 노션 월간 리포트 핵심 요약을 바탕으로 캔버스 갱신.
- 기존 캔버스가 있으면 `slack_read_canvas`로 현재 내용 확인 후 `slack_update_canvas`,
  없으면 `slack_create_canvas`로 신규 생성.
- 담을 내용: 그 달 핵심 지표(주문/ GMV/ 신규설치/ 일치율/ MAU), 전월 대비, 한 줄 진단, 다음 액션.

---

## 5. 상태 기록
- `data\.pipeline-state\<월>.json`에 각 단계 완료 여부가 기록된다(`analyzed`, `appdb_present` 등).
- 발행까지 끝나면 사람이 최종 검토 후 확정. 초기 몇 달은 노션/슬랙 반영 **전에** 요약을
  사용자에게 보여주고 승인받는다.

---

## 아직 자동화 안 된 부분 (수동 or 향후)
- AppsFlyer raw 자동 수집 (Pull API 토큰 or MCP 커넥터 연결 대기)
- 마스터 엑셀의 국가/언어/세그먼트/ROAS 시트, 분기 리포트 파일 자동 갱신
- ROAS 귀속 분석 (af_ads 집계 리포트 연동 필요)
- `/schedule` 정기 자동 실행 등록 (안정화 후)
