# dk-monthly-pipeline

배달K 월간 마케팅 리포트 자동화 도구. AppsFlyer raw 데이터 + 앱 DB export를 분석해서
로컬 마스터 엑셀 / 노션 / 슬랙 캔버스를 갱신한다.

전체 실행 순서와 노션·슬랙 발행 절차는 **[RUNBOOK.md](./RUNBOOK.md)** 참고.

## 스크립트
| 파일 | 역할 |
|---|---|
| `run-month.js` | **월간 원클릭 오케스트레이터**: analyze→channel-cohort→(있으면)channel-roas→update-local-files 순차 실행 + 요약. `--month=YYYY-MM` |
| `analyze.js` | raw CSV + 앱DB → 지표 산출(JSON). `--month=YYYY-MM`. 기본 지표 + 확장 지표(AOV·채널품질·신규vs기존·활성화율·결제/배달믹스·빈도·가맹점·시간대·수익성) — 상세는 RUNBOOK "확장 지표" |
| `update-local-files.js` | 매월 마스터 엑셀 `1.월별요약` upsert + 분기 마감월엔 분기 리포트 자동생성. `--month=YYYY-MM` |
| `build-quarterly-report.js` | 분기 3개월 분석을 합산해 6-시트 분기 리포트 생성. `--quarter=YYYY-Q` \| `--month=YYYY-MM` (`--allow-incomplete`로 결측월 강행) |
| `channel-roas.js` | af_ads(캠페인별 광고비 CSV) → 채널별 광고비·설치·CAC + 대시보드 ROAS(과대, 라벨링). `--month=YYYY-MM` |
| `channel-cohort.js` | 설치코호트(신규 귀속) → 채널별 신규 활성화율·순LTV/설치(month-0, 대시보드 착시 제거). `--month=YYYY-MM` |
| `fetch-appsflyer.js` | (보류) Pull API 자동수집. dev_key 필요 |

## lib
| 파일 | 역할 |
|---|---|
| `csv.js` | CSV 파서 + 대용량용 스트리밍 파서(`streamCsvRows`) |
| `xlsxReader.js` | .xlsx 시트 읽기(무의존, `unzip` 사용) |
| `xlsxWriter.js` | .xlsx 신규 작성(무의존 zip 빌더) |
| `xlsxRowEditor.js` | 기존 .xlsx의 한 시트에 행 upsert(서식 보존) |
| `userLedger.js` | CUID 누적 이력 기반 교민/여행객 세그먼트 분류 |
| `state.js` | 월별 파이프라인 진행상태 기록 |

## 데이터/경로
`config.js`에 정의. 모두 저장소 밖 `C:\Users\Admin\Desktop\DK_monthly\` 아래.
비밀값(토큰)은 `.secrets\`에 보관하며 저장소에 커밋하지 않는다.

## 검증 상태 (2026-07-21)
`analyze.js`는 2026-06 실데이터로 노션 확정값과 대조 검증됨(신규설치·주문유저·앱DB주문수·5회+매출비중
정확히 일치, AF주문수·GMV 오차 ~0.05%). `update-local-files.js`는 마스터 복사본으로 신규추가/기존갱신/
서식보존 확인됨.
