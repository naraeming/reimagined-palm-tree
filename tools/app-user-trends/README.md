# 앱 회원 가입월별 분석

가입 연월별로 내려받은 회원 엑셀을 검증하고 계정·현재 언어·기록 지역별 집계 결과를 생성합니다. 광고 성과 분석 파이프라인과 별도로 사용합니다.

## 데이터 계약

- 파일명은 `YYMM.xlsx`이며 해당 월에 등록한 계정의 목록입니다. 파일명은 스냅샷 월을 뜻하지 않습니다.
- 필수 컬럼: `id`, `locale`, `country`, `city`, `orders`, `reviews`, `shops`, `level`, `disabled`.
- `id`는 숫자 ID 또는 `숫자 ID. 이름` 형태입니다. 결과에는 숫자 ID와 이름 모두 쓰지 않습니다.
- 같은 숫자 ID의 모든 원본 컬럼이 동일한 반복 행만 한 행으로 집계합니다. 값이 충돌하거나 가입월 파일 사이에 ID가 겹치면 실행을 중단해 검토합니다.
- 다른 ID를 이름·이메일·IP 기준으로 병합하지 않습니다. 한 사람이 여러 계정을 보유할 수 있으므로 실제 사람 수로 해석하지 않습니다.
- 언어는 추출 당시 앱 설정값입니다. 과거 가입월별 분류는 당시 사용 언어의 이력이 아닙니다.
- 국가·도시의 수집 기준이 확인되기 전에는 회원 데이터에 기록된 지역으로만 해석합니다.
- 주문·리뷰는 추출 당시 누적값입니다. 빈칸은 의미 확인 전 0으로 바꾸지 않습니다. `shops`는 건수인지 식별자인지 확인 전 합산하지 않습니다.

## 실행

Python에 `openpyxl`이 필요합니다. 원본 폴더와 결과 폴더를 명시합니다.

```powershell
python -X utf8 tools/app-user-trends/analyze.py --input '<원본 폴더>' --output 'outputs/private-app-user-trends/<분석기간>/aggregates' --start YYYY-MM --end YYYY-MM
```

결과는 집계 JSON·CSV와 출처별 파일명·체크섬입니다. 행 단위 개인정보는 쓰지 않습니다. 원본 파일은 읽기만 합니다.

전체 월별 자료임이 확인된 경우에만 `--completeness-confirmed`를 사용합니다. 모든 월의 건수가 같은 경우 내보내기 제한 가능성을 먼저 확인해야 합니다. 빈칸이 0건이라는 사실을 확인한 경우에만 `--blank-counts-are-zero`를 사용합니다.

성장률은 다음 기준을 따릅니다.

- 전월 대비: 해당 월 계정 수 / 직전 월 계정 수 − 1.
- 전년 동월 대비: 해당 월 계정 수 / 전년 같은 월 계정 수 − 1.
- 연간 대비: 해당 연도와 전년도 모두 12개월이 있을 때만 산출.
- 동일 기간 대비: 해당 연도 1월부터 마지막 확보 월까지와 전년의 같은 월 범위를 비교.
- 전기값이 없거나 0이면 `n.a.`로 남깁니다. 전체성 미확인 시 성장률은 계산하지 않습니다.

Excel 보고서는 Codex 런타임의 `@oai/artifact-tool`로 작성합니다. 해당 런타임의 `node_modules`를 이 폴더에 연결한 뒤 실행합니다. 원본 데이터나 런타임 종속 파일을 저장소에 커밋하지 않습니다.

```powershell
node tools/app-user-trends/build-report.mjs 'outputs/private-app-user-trends/<분석기간>/aggregates/analysis.json' 'outputs/private-app-user-trends/<분석기간>'
```

보고서에는 요약, 월별 집계, 언어별 구성, 지역별 구성, 국가·언어 교차표, 해석 제한이 포함됩니다. 수식 의존성의 재계산, 계정 수 합계, 수식 오류, 시트 렌더링을 점검합니다.

저장 후 원본 체크섬, ID 추출과 독립적인 전체 행 중복 검사, 분류별 합계, Excel 캐시값과 차트를 검증합니다.

```powershell
python -X utf8 tools/app-user-trends/verify.py --input '<원본 폴더>' --report-dir 'outputs/private-app-user-trends/<분석기간>'
```

## 저장 및 확장

공개 저장소에는 분석 코드와 방법만 저장합니다. 실제 결과와 검증 파일은 Git에서 제외한 `outputs/private-app-user-trends/`에 보관합니다. 이 경로는 Git 추적 제외 경로이며 OS 접근 제어를 설정하는 기능은 아닙니다.

이전 가입월 파일을 추가하면 입력 기간을 확장해 다시 실행합니다. 파일 전체성을 먼저 확인한 뒤 연간·동일 기간 성장률을 갱신합니다. 주문 이력이나 AppsFlyer 집계가 추가되면 기존 계정 데이터와 구분된 측정 단위를 유지합니다.
