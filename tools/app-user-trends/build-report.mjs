import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node build-report.mjs analysis.json output-directory');
const d = JSON.parse(await fs.readFile(input,'utf8'));
const reportName=`회원분석_${d.scope.first_month.replace('-','')}-${d.scope.last_month.replace('-','')}_제공분검증.xlsx`;
const sameCount = d.monthly.every(m=>m.accounts===d.monthly[0].accounts);
const scopeWarning=d.scope.growth_available?'전체성 확인 후 비교 가능한 성장률을 계산했습니다.':sameCount?`매월 ${d.monthly[0].accounts}계정으로 동일해 전체 규모·성장률 계산을 보류했습니다.`:'파일 전체성 확인 전까지 전체 규모·성장률 계산을 보류했습니다.';
await fs.mkdir(output,{recursive:true});
const wb=Workbook.create();
const names=['요약','월별집계','언어별','지역별','국가언어','방법과확인사항'];
const sheets=Object.fromEntries(names.map(n=>[n,wb.worksheets.add(n)]));
const navy='#183653',blue='#337AB7',orange='#C87627',gray='#586574',light='#EEF2F6';
const font='Malgun Gothic';
function base(s,range,width=15){
  s.showGridLines=false;
  s.getRange(range).format.font={name:font,size:10,color:'#202B36'};
  s.getRange(range).format.columnWidth=width;
  s.getRange(range).format.rowHeight=23;
  s.getRange(range).format.verticalAlignment='center';
}
function title(s,text){s.getRange('A2').values=[[text]];s.getRange('A2').format.font={name:font,size:16,bold:true,color:navy};}
function note(s,cell,text){s.getRange(cell).values=[[text]];s.getRange(cell).format.font={name:font,size:10,color:gray};}
function header(s,range,values){s.getRange(range).values=[values];s.getRange(range).format={fill:navy,font:{name:font,size:10,bold:true,color:'#FFFFFF'},rowHeight:36,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};}
function count(s,range){s.getRange(range).setNumberFormat('#,##0');s.getRange(range).format.horizontalAlignment='right';}
function pct(s,range){s.getRange(range).setNumberFormat('0.0%');s.getRange(range).format.horizontalAlignment='right';}
function chartStyle(chart,title,a,b){chart.title=title;chart.titleTextStyle.fontSize=13;chart.titleTextStyle.typeface=font;chart.setPosition(a,b);chart.hasLegend=false;chart.xAxis={axisType:'textAxis',textStyle:{typeface:font,fontSize:10}};chart.yAxis={numberFormatCode:'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:10}};for(const series of chart.series.items)series.fill=blue;}
function col(i){let str='';for(i++;i;i=Math.floor((i-1)/26))str=String.fromCharCode(65+(i-1)%26)+str;return str;}

const mon=sheets['월별집계'];
base(mon,`A1:O${d.monthly.length+7}`);
title(mon,'가입월별 파일 집계');
note(mon,'A3','제공 파일 내 계정 기준. 주문·리뷰는 추출 당시 누적값이며 가입월에 발생한 건수가 아닙니다.');
note(mon,'A4','출처: 파일명 YYMM.xlsx의 가입월 필터. 숫자 회원 ID로 완전히 같은 중복 행만 제거.');
header(mon,'A6:O6',['가입월','원본 행 수','제거 중복 행','고유 계정 수','주문값 양수 계정','주문값 빈칸 계정','기록된 누적 주문','리뷰값 양수 계정','상점필드 있음','disabled=true','도시 미기록','전월 대비','전년 동월 대비','원본 파일','고유 ID 검증']);
const end=d.monthly.length+6;
for(let i=0;i<d.monthly.length;i++){
  const m=d.monthly[i],r=i+7;
  mon.getRange(`A${r}:K${r}`).values=[[m.month,m.raw_rows,m.duplicate_rows_removed,null,m.orders_positive_accounts,m.orders_blank_accounts,m.recorded_cumulative_orders,m.reviews_positive_accounts,m.shops_field_present_accounts,m.disabled_true_accounts,m.city_missing_accounts]];
  mon.getRange(`D${r}`).formulas=[[`=B${r}-C${r}`]];
  mon.getRange(`L${r}`).formulas=[[d.scope.growth_available&&i>0?`=IF(D${r-1}=0,"n.a.",D${r}/D${r-1}-1)`:'="n.a."']];
  mon.getRange(`M${r}`).formulas=[[d.scope.growth_available&&i>=12?`=IF(D${r-12}=0,"n.a.",D${r}/D${r-12}-1)`:'="n.a."']];
  mon.getRange(`N${r}`).values=[[m.file]];
  mon.getRange(`O${r}`).values=[[m.accounts]];
}
count(mon,`B7:K${end}`);pct(mon,`L7:M${end}`);count(mon,`O7:O${end}`);
mon.getRange('A1:A28').format.columnWidth=13;mon.getRange('N1:N28').format.columnWidth=17;
mon.freezePanes.freezeRows(6);

const lang=sheets['언어별'];base(lang,`A1:L${Math.max(48,d.monthly.length+20)}`);title(lang,'현재 설정 언어별 구성');
note(lang,'A3','가입 당시 언어가 아닌 추출 당시 앱 설정 언어. 최초 기기 언어를 따르고 이후 변경 가능합니다.');
header(lang,'A6:C6',['현재 언어','제공분 계정 수','제공분 내 비중']);
for(let i=0;i<d.languages.length;i++){const r=i+7;lang.getRange(`A${r}:B${r}`).values=[[d.languages[i].language,d.languages[i].accounts]];lang.getRange(`C${r}`).formulas=[[`=B${r}/SUM($B$7:$B$${6+d.languages.length})`]];}
count(lang,`B7:B${6+d.languages.length}`);pct(lang,`C7:C${6+d.languages.length}`);
note(lang,'A15','출처: 월별 회원 파일의 locale. 아래는 가입월별 제공분을 현재 언어로 분류한 계정 수입니다.');
const langs=d.languages.map(x=>x.language), lastLang=col(langs.length),totalCol=col(langs.length+1);
header(lang,`A17:${totalCol}17`,['가입월',...langs,'제공분 합계']);
for(let i=0;i<d.monthly.length;i++){const month=d.monthly[i].month,r=i+18;lang.getRange(`A${r}:${lastLang}${r}`).values=[[month,...langs.map(l=>d.monthly_language.find(x=>x.month===month&&x.language===l)?.accounts??0)]];lang.getRange(`${totalCol}${r}`).formulas=[[`=SUM(B${r}:${lastLang}${r})`]];}
count(lang,`B18:${totalCol}${17+d.monthly.length}`);
const lc=lang.charts.add('bar',lang.getRange(`A6:B${6+d.languages.length}`));chartStyle(lc,'현재 언어별 제공분 계정 수','E5','L14');

const geo=sheets['지역별'];base(geo,`A1:H${Math.max(d.cities.length,d.countries.length)+7}`,16);title(geo,'회원 데이터에 기록된 지역');
note(geo,'A3','국적·거주지·배달 지역으로 단정하지 않습니다. 국가·도시 필드의 생성 기준은 확인이 필요합니다.');
note(geo,'A4','출처: 월별 회원 파일의 country와 city. 도시명은 공백·대소문자만 정리하고 유사 지명은 합치지 않았습니다.');
header(geo,'A6:C6',['국가 코드','제공분 계정 수','제공분 내 비중']);
for(let i=0;i<d.countries.length;i++){const r=i+7;geo.getRange(`A${r}:B${r}`).values=[[d.countries[i].country,d.countries[i].accounts]];geo.getRange(`C${r}`).formulas=[[`=B${r}/SUM($B$7:$B$${6+d.countries.length})`]];}
header(geo,'E6:H6',['국가 코드','도시 기록값','제공분 계정 수','제공분 내 비중']);
for(let i=0;i<d.cities.length;i++){const r=i+7;geo.getRange(`E${r}:G${r}`).values=[[d.cities[i].country,d.cities[i].city,d.cities[i].accounts]];geo.getRange(`H${r}`).formulas=[[`=G${r}/SUM($G$7:$G$${6+d.cities.length})`]];}
geo.getRange(`F1:F${d.cities.length+7}`).format.columnWidth=30;geo.getRange(`D1:D${d.cities.length+7}`).format.columnWidth=3;
count(geo,`B7:B${d.countries.length+6}`);pct(geo,`C7:C${d.countries.length+6}`);count(geo,`G7:G${d.cities.length+6}`);pct(geo,`H7:H${d.cities.length+6}`);geo.freezePanes.freezeRows(6);

const cross=sheets['국가언어'];base(cross,`A1:${totalCol}${d.countries.length+7}`);title(cross,'국가와 현재 설정 언어');
note(cross,'A3','같은 기록 국가 내 언어 구성을 확인하는 표입니다. 계정의 국적이나 실제 사람 수를 뜻하지 않습니다.');
note(cross,'A4','출처: 월별 회원 파일의 country × locale. 제공분의 관측 건수만 표시합니다.');
header(cross,`A6:${totalCol}6`,['국가 코드',...langs,'제공분 합계']);
for(let i=0;i<d.countries.length;i++){const c=d.countries[i].country,r=i+7;cross.getRange(`A${r}:${lastLang}${r}`).values=[[c,...langs.map(l=>d.country_language.find(x=>x.country===c&&x.language===l)?.accounts??0)]];cross.getRange(`${totalCol}${r}`).formulas=[[`=SUM(B${r}:${lastLang}${r})`]];}
count(cross,`B7:${totalCol}${6+d.countries.length}`);cross.freezePanes.freezeRows(6);

const how=sheets['방법과확인사항'];base(how,'A1:C24',24);title(how,'집계 방법과 확인 사항');
header(how,'A5:C5',['항목','적용 기준','추가 확인']);
const method=[
 ['분석 기간',`${d.scope.first_month}~${d.scope.last_month} 가입월 파일 ${d.scope.file_count}개`,'이전 가입월 파일은 추후 추가'],
 ['계정 단위','숫자 회원 ID로 구분. 동일인이 여러 계정을 만들 수 있음','실제 사람 수 추정 불가'],
 ['가입월','파일명 YYMM. 월초 00:00~월말 23:59 등록 기준','관리 화면 필터의 시간대 확인'],
 ['중복 처리','동일 숫자 ID 및 모든 필드가 같은 행만 1개로 집계','서로 다른 ID를 동일인으로 합치지 않음'],
 ['파일 전체성',d.scope.completeness_confirmed?'월 전체 자료로 확인됨':sameCount?`모든 파일이 고유 ID ${d.monthly[0].accounts}개. 전체성 미확인`:'월 전체 자료인지 미확인','건수 제한·현재 페이지만 다운로드 여부 확인'],
 ['성장률',d.scope.growth_available?'비교 가능 기간만 산출':'전월·전년 동월·연간 성장률 계산 보류','완전한 월별 계정 수 확보 필요'],
 ['연간 비교','연간 전체와 일부 월의 합계를 직접 비교하지 않음','전체성 확인 후 전년 동일 기간 비교'],
 ['현재 앱 언어','추출 당시 값. 최초에는 기기 언어, 이후 변경 가능','과거 당시 언어 추이 복원 불가'],
 ['주문·리뷰 빈칸',d.scope.blank_counts_are_zero?'사용자 확인: 0건':'빈칸과 0을 구분. 의미 확인 전 0으로 대체하지 않음','관리 화면의 빈칸 의미 확인'],
 ['누적 주문','추출 당시 해당 계정에 기록된 누적값','월별 주문량·매출·재주문율은 주문 이력 필요'],
 ['가입월별 비교','오래된 계정은 관찰 기간이 길어 누적값이 커질 수 있음','같은 관찰 기간의 유지율은 계산 불가'],
 ['상점 필드','값이 있는 계정 수만 집계. 숫자 합계 사용 안 함','상점 ID인지 상점 수인지 확인'],
 ['회원등급·disabled','정의 미확인으로 임의 제외하지 않음','테스트·업소·탈퇴 계정 분리 기준 필요'],
 ['지역','회원 파일의 country·city 값을 사용','IP 기반 지역인지 직접 설정인지 확인'],
 ['마지막 업데이트·인증','가입·접속·활성 시점으로 대체하지 않음','각 필드 의미 확인'],
 ['자료 기준일','출처 목록에 파일 수정일 기록. 실제 추출일은 별도 확인','원본 파일 변경 없이 읽기만 수행'],
 ['AppsFlyer','현재 미제공. 회원 데이터와 개인별 연결하지 않음','설치·활성·재방문 집계 추가 필요'],
 ['제공 결과','원본 ID·이름·이메일·IP를 포함하지 않는 집계 결과','분석 결과는 별도 로컬 폴더에 보관'],
];
how.getRange(`A6:C${5+method.length}`).values=method;how.getRange('A1:A24').format.columnWidth=24;how.getRange('B1:B24').format.columnWidth=72;how.getRange('C1:C24').format.columnWidth=53;
how.getRange('A6:C24').format.wrapText=true;how.getRange('A6:C24').format.rowHeight=38;

const sum=sheets['요약'];base(sum,'A1:L39',14);title(sum,'회원 파일 검증과 관측 구성');sum.tabColor=navy;
note(sum,'A3',`가입월 ${d.scope.first_month}~${d.scope.last_month} | 현재 앱 설정 언어 기준 | 계정 단위`);
sum.getRange('A5').values=[[scopeWarning]];
sum.getRange('A5').format.font={name:font,size:11,bold:true,color:orange};
header(sum,'A7:C7',['검증 항목','계정 / 행','해석']);
const summaryRows=[['원본 행 수',`=SUM('월별집계'!B7:B${end})`,`제공된 ${d.scope.file_count}개 파일`],['중복 제거 행',`=SUM('월별집계'!C7:C${end})`,'동일 계정·동일 내용'],['고유 계정 수',`=SUM('월별집계'!D7:D${end})`,'실제 사람 수 아님'],['주문값 양수 계정',`=SUM('월별집계'!E7:E${end})`,'누적 주문 기록 있음'],['주문값 빈칸 계정',`=SUM('월별집계'!F7:F${end})`,d.scope.blank_counts_are_zero?'0건으로 확인':'0건 여부 미확인'],['도시 미기록 계정',`=SUM('월별집계'!K7:K${end})`,'지역 해석의 한계']];
for(let i=0;i<summaryRows.length;i++){const r=i+8;sum.getRange(`A${r}`).values=[[summaryRows[i][0]]];sum.getRange(`B${r}`).formulas=[[summaryRows[i][1]]];sum.getRange(`C${r}`).values=[[summaryRows[i][2]]];}
sum.getRange('A1:A39').format.columnWidth=24;sum.getRange('B1:B39').format.columnWidth=16;sum.getRange('C1:C39').format.columnWidth=28;sum.getRange('D1:D39').format.columnWidth=3;count(sum,'B8:B13');
header(sum,'A16:C16',['현재 언어','제공분 계정 수','제공분 내 비중']);
for(let i=0;i<d.languages.length;i++){const r=i+17;sum.getRange(`A${r}:C${r}`).formulas=[[`='언어별'!A${i+7}`,`='언어별'!B${i+7}`,`='언어별'!C${i+7}`]];}
count(sum,`B17:B${16+d.languages.length}`);pct(sum,`C17:C${16+d.languages.length}`);
header(sum,'F25:H25',['기록 국가','제공분 계정 수','제공분 내 비중']);
for(let i=0;i<Math.min(6,d.countries.length);i++){sum.getRange(`F${i+26}:H${i+26}`).formulas=[[`='지역별'!A${i+7}`,`='지역별'!B${i+7}`,`='지역별'!C${i+7}`]];}
count(sum,'G26:G31');pct(sum,'H26:H31');
const gc=sum.charts.add('bar',sum.getRange('F25:G31'));chartStyle(gc,'기록 국가별 제공분 계정 수','E7','L22');
note(sum,'A32','해석에 필요한 제한');
const limitations=[
 '제공분의 구성 비중입니다. 전체 회원의 규모·구성·성장률로 일반화할 수 없습니다.',
 '현재 설정 언어로 과거 가입월을 분류했습니다. 당시 언어 변화는 알 수 없습니다.',
 '기록 국가·도시는 국적이나 실제 배달 지역과 다를 수 있습니다.',
 '누적 주문 수는 월별 주문량이나 같은 관찰 기간의 전환·유지율이 아닙니다.',
 '다음 단계: 월 전체 내보내기 확인, 빈칸 의미 확인, 이전 가입월·주문·AppsFlyer 추가.',
];
for(let i=0;i<limitations.length;i++)note(sum,`A${33+i}`,limitations[i]);

// Verify a representative dependency change, then restore before final verification.
const originalRows=mon.getRange('B7').values[0][0];
mon.getRange('B7').values=[[originalRows+1]];
if(sum.getRange('B10').values[0][0]!==d.totals.accounts+1)throw new Error('Summary does not recalculate after source change');
mon.getRange('B7').values=[[originalRows]];
wb.recalculate();
const expected=d.totals.accounts;
if(sum.getRange('B10').values[0][0]!==expected)throw new Error('Headline account count does not reconcile');
if(mon.getRange(`D7:D${end}`).values.some((r,i)=>r[0]!==d.monthly[i].accounts))throw new Error('Monthly unique counts do not reconcile');
if(lang.getRange(`${totalCol}18:${totalCol}${17+d.monthly.length}`).values.some((r,i)=>r[0]!==d.monthly[i].accounts))throw new Error('Language counts do not reconcile');
const formulas=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Formula error scan'});
await fs.writeFile(path.join(output,'formula-check.json'),formulas.ndjson);
console.log((await wb.inspect({kind:'table',range:'요약!A7:C13',include:'values,formulas',tableMaxRows:7,tableMaxCols:3,maxChars:2000})).ndjson);
const views=[['요약','A1:L39'],['월별집계','A1:O15'],['언어별','A1:L26'],['지역별','A1:H18'],['국가언어',`A1:${totalCol}18`],['방법과확인사항','A1:C24']];
for(const [sheetName,range] of views){const blob=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(output,`preview-${sheetName}.png`),new Uint8Array(await blob.arrayBuffer()));}
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(path.join(output,reportName));
console.log(JSON.stringify({output:path.join(output,reportName),sheets:names,accounts:expected}));
