import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';

const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node build-order-report.mjs order-analysis.json output-dir');
const d=JSON.parse(await fs.readFile(input,'utf8'));
if(d.scope.months.length!==1)throw new Error('This report layout requires one month; monthly trend reporting is separate.');
await fs.mkdir(output,{recursive:true});
const wb=Workbook.create();
const sheetNames=['주문요약','국가도시','언어업종','국가언어','통화금액','집계자료'];
const s=Object.fromEntries(sheetNames.map(name=>[name,wb.worksheets.add(name)]));
const font='Malgun Gothic',navy='#173754',blue='#397CB4',amber='#AD641D',gray='#536272';
const numFmt='#,##0',pctFmt='0.00%',moneyFmt='#,##0.00';
function setup(sheet,range,width=16){sheet.showGridLines=false;sheet.getRange(range).format={font:{name:font,size:10,color:'#263442'},columnWidth:width,rowHeight:24,verticalAlignment:'center'};}
function title(sheet,text){sheet.getRange('A2').values=[[text]];sheet.getRange('A2').format.font={name:font,size:16,bold:true,color:navy};}
function note(sheet,cell,text){sheet.getRange(cell).values=[[text]];sheet.getRange(cell).format.font={name:font,size:10,color:gray};}
function header(sheet,range,values){sheet.getRange(range).values=[values];sheet.getRange(range).format={font:{name:font,size:10,bold:true,color:'#FFFFFF'},fill:navy,rowHeight:38,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};}
function number(sheet,range,format=numFmt){sheet.getRange(range).setNumberFormat(format);sheet.getRange(range).format.horizontalAlignment='right';}
function column(index){let name='';for(index++;index;index=Math.floor((index-1)/26))name=String.fromCharCode(65+(index-1)%26)+name;return name;}
function esc(value){return String(value).replaceAll('"','""');}
function chart(sheet,range,titleText,from,to){const c=sheet.charts.add('bar',sheet.getRange(range));c.title=titleText;c.titleTextStyle.typeface=font;c.titleTextStyle.fontSize=13;c.hasLegend=false;c.setPosition(from,to);c.xAxis={axisType:'textAxis',textStyle:{typeface:font,fontSize:10}};c.yAxis={numberFormatCode:'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:10}};c.series.items[0].fill=blue;return c;}

const raw=s['집계자료'],rawEnd=d.rows.length+5;
setup(raw,`A1:M${rawEnd}`,15);title(raw,'입력 집계 자료');
note(raw,'A3','출처: '+d.sources.map(x=>x.file).join(', ')+' / 머리글 없는 첫 행부터 모두 포함 / 금액·건수는 원본 값을 유지');
header(raw,'A5:M5',['주문월','통화','국가','도시','업종','주문언어','상태 코드','상태 해석','상태 분류','상품금액','최종금액','주문수','원본 행']);
raw.getRange(`A6:M${rawEnd}`).values=d.rows.map(r=>[r.month,r.currency,r.country,r.city,r.industry,r.language,r.status==='blank'?'공란':r.status,r.status_label,r.status_group,Number(r.product_amount),Number(r.final_amount),r.orders,r.source_row]);
raw.getRange(`D1:D${rawEnd}`).format.columnWidth=22;raw.getRange(`H1:I${rawEnd}`).format.columnWidth=26;raw.getRange(`J1:K${rawEnd}`).format.columnWidth=24;
number(raw,`J6:K${rawEnd}`,'#,##0.000');number(raw,`L6:M${rawEnd}`);raw.freezePanes.freezeRows(5);
const rcol=c=>`'집계자료'!$${c}$6:$${c}$${rawEnd}`;
function sumifs(measure,conditions){return `SUMIFS(${rcol(measure)},${conditions.map(([c,v])=>`${rcol(c)},${v}`).join(',')})`;}

const geo=s['국가도시'];const cityStart=20,geoEnd=cityStart+d.cities.length;
setup(geo,`A1:H${geoEnd}`,17);title(geo,'국가·도시별 주문 구성');
note(geo,'A3','배달 지역 기준. 취소율 = 취소 주문수 / 해당 지역 전체 주문수. 주문수는 사람 수가 아닙니다.');
const geoHeads=['국가','전체 주문','배달완료','주문취소','기타 상태','주문 비중','취소율'];
header(geo,'A6:G6',geoHeads);
function dimensionRow(sheet,row,key,rawColumn){
  sheet.getRange(`A${row}`).values=[[key]];
  sheet.getRange(`B${row}:G${row}`).formulas=[[
    `=${sumifs('L',[[rawColumn,`A${row}`]])}`,
    `=${sumifs('L',[[rawColumn,`A${row}`],['I','"completed"']])}`,
    `=${sumifs('L',[[rawColumn,`A${row}`],['I','"cancelled"']])}`,
    `=B${row}-C${row}-D${row}`,
    `=B${row}/SUM(${rcol('L')})`,
    `=IF(B${row}=0,"n.a.",D${row}/B${row})`
  ]];
}
d.countries.forEach((r,i)=>dimensionRow(geo,i+7,r.country,'C'));
number(geo,`B7:E${d.countries.length+6}`);number(geo,`F7:G${d.countries.length+6}`,pctFmt);
note(geo,'A17','주문수가 매우 적은 지역은 취소율의 순위보다 건수를 함께 보세요.');
header(geo,`A${cityStart}:H${cityStart}`,['국가','도시','전체 주문','배달완료','주문취소','기타 상태','주문 비중','취소율']);
for(let i=0;i<d.cities.length;i++){const row=cityStart+1+i,r=d.cities[i];geo.getRange(`A${row}:B${row}`).values=[[r.country,r.city]];geo.getRange(`C${row}:H${row}`).formulas=[[
`=${sumifs('L',[['C',`A${row}`],['D',`B${row}`]])}`,
`=${sumifs('L',[['C',`A${row}`],['D',`B${row}`],['I','"completed"']])}`,
`=${sumifs('L',[['C',`A${row}`],['D',`B${row}`],['I','"cancelled"']])}`,
`=C${row}-D${row}-E${row}`,`=C${row}/SUM(${rcol('L')})`,`=IF(C${row}=0,"n.a.",E${row}/C${row})`]];}
geo.getRange(`B1:B${geoEnd}`).format.columnWidth=24;number(geo,`C${cityStart+1}:F${geoEnd}`);number(geo,`G${cityStart+1}:H${geoEnd}`,pctFmt);

const li=s['언어업종'];setup(li,'A1:G38',18);title(li,'주문언어·업종별 구성');
note(li,'A3','주문언어 기준의 주문수입니다. 언어별 사용자 수나 국적을 의미하지 않습니다.');
header(li,'A6:G6',['주문언어','전체 주문','배달완료','주문취소','기타 상태','주문 비중','취소율']);
d.languages.forEach((r,i)=>dimensionRow(li,i+7,r.language,'F'));
header(li,'A17:G17',['업종 코드','전체 주문','배달완료','주문취소','기타 상태','주문 비중','취소율']);
d.industries.forEach((r,i)=>dimensionRow(li,i+18,r.industry,'E'));
number(li,'B7:E12');number(li,'F7:G12',pctFmt);number(li,'B18:E23');number(li,'F18:G23',pctFmt);
note(li,'A26','업종은 원본 코드를 유지했습니다. 식당·마트 외 업종도 포함되어 있습니다.');
note(li,'A28','취소율 차이는 국가·도시·업종 구성의 영향을 받을 수 있어 원인으로 단정하지 않습니다.');

const cross=s['국가언어'],langs=d.languages.map(r=>r.language),last=column(langs.length),endcol=column(langs.length+1);
setup(cross,`A1:${endcol}20`,17);title(cross,'국가별 주문언어');
note(cross,'A3','전체 상태의 주문수를 국가와 주문언어로 교차 집계했습니다.');
header(cross,`A6:${endcol}6`,['국가',...langs,'합계']);
for(let i=0;i<d.countries.length;i++){const row=i+7;cross.getRange(`A${row}`).values=[[d.countries[i].country]];
for(let j=0;j<langs.length;j++){const c=column(j+1);cross.getRange(`${c}${row}`).formulas=[[`=${sumifs('L',[['C',`$A${row}`],['F',`${c}$6`]])}`]];}
cross.getRange(`${endcol}${row}`).formulas=[[`=SUM(B${row}:${last}${row})`]];}
number(cross,`B7:${endcol}${6+d.countries.length}`);

const cur=s['통화금액'];setup(cur,'A1:H23',21);title(cur,'통화별 배달완료 주문금액');
note(cur,'A3',d.scope.amounts_are_sums_confirmed?'금액은 행별 합계로 확인됨. 상태가 배달완료인 주문만 금액·객단가에 포함.':'상품금액·최종금액이 행별 합계인지 확인 전입니다. 아래 합산액은 잠정값이며 객단가는 계산하지 않았습니다.');
note(cur,'A4','통화는 합산하지 않습니다. 최종금액은 배달비·할인 포함 금액이며 회사 매출·이익이나 정산 완료액을 뜻하지 않습니다.');
header(cur,'A6:H6',['통화','배달완료 주문','완료 상품금액','완료 최종금액','주문당 최종금액','상품 대비 차액','전체 주문','주문취소']);
for(let i=0;i<d.currency.length;i++){const row=i+7,c=d.currency[i].currency;cur.getRange(`A${row}`).values=[[c]];cur.getRange(`B${row}:H${row}`).formulas=[[
`=${sumifs('L',[['B',`A${row}`],['I','"completed"']])}`,
`=${sumifs('J',[['B',`A${row}`],['I','"completed"']])}`,
`=${sumifs('K',[['B',`A${row}`],['I','"completed"']])}`,
d.scope.amounts_are_sums_confirmed?`=IF(B${row}=0,"n.a.",D${row}/B${row})`:'="합계 기준 확인 전"',
`=D${row}-C${row}`,`=${sumifs('L',[['B',`A${row}`]])}`,`=${sumifs('L',[['B',`A${row}`],['I','"cancelled"']])}`]];}
cur.getRange('C1:D23').format.columnWidth=26;cur.getRange('E1:F23').format.columnWidth=24;
number(cur,`B7:B${6+d.currency.length}`);number(cur,`C7:F${6+d.currency.length}`,moneyFmt);number(cur,`G7:H${6+d.currency.length}`);
note(cur,'A17','차액에는 배달비·할인 등 여러 요소가 섞여 있어 배달비 또는 할인액으로 분해할 수 없습니다.');
note(cur,'A19','취소·접수 및 기타 상태의 금액은 배달완료 금액에서 제외했습니다.');

const summary=s['주문요약'];setup(summary,'A1:M44',14);summary.tabColor=navy;title(summary,`${d.scope.months.join(', ')} 주문 집계 검토`);
note(summary,'A3',d.scope.admin_total_matches===true?'월 전체 집계 및 관리자 총건수 일치 확인됨. 추출 시점의 주문 상태 기준.':d.scope.admin_total_matches===false?'관리자 총건수와 파일 합계가 다릅니다. 누락·조회 조건을 확인해야 합니다.':d.scope.full_month_confirmed?'월 전체 집계로 전달받음(사용자 확인). 관리자 총건수 대조는 미완료. 추출 시점의 상태 기준.':'제공 파일 기준 분석. 월 전체 집계 여부와 관리자 총건수의 일치 확인이 필요합니다.');
header(summary,'A6:C6',['상태','주문수','전체 비중']);
for(let i=0;i<d.status.length;i++){const r=i+7,st=d.status[i];summary.getRange(`A${r}`).values=[[st.status_label]];summary.getRange(`B${r}:C${r}`).formulas=[[`=${sumifs('L',[['G',`"${st.status==='blank'?'공란':esc(st.status)}"`]])}`,`=B${r}/SUM(${rcol('L')})`]];}
const totalRow=7+d.status.length;summary.getRange(`A${totalRow}`).values=[['전체 주문']];summary.getRange(`B${totalRow}`).formulas=[[`=SUM(B7:B${totalRow-1})`]];summary.getRange(`C${totalRow}`).formulas=[[`=SUM(C7:C${totalRow-1})`]];
summary.getRange(`A${totalRow}:C${totalRow}`).format.font={name:font,size:10,bold:true,color:navy};number(summary,`B7:B${totalRow}`);number(summary,`C7:C${totalRow}`,pctFmt);
summary.getRange('A1:A44').format.columnWidth=27;summary.getRange('B1:C44').format.columnWidth=17;summary.getRange('D1:D44').format.columnWidth=3;
header(summary,'A17:C17',['국가','전체 주문','주문 비중']);
for(let i=0;i<d.countries.length;i++){const row=i+18;summary.getRange(`A${row}:C${row}`).formulas=[[`='국가도시'!A${i+7}`,`='국가도시'!B${i+7}`,`='국가도시'!F${i+7}`]];}
number(summary,'B18:B24');number(summary,'C18:C24',pctFmt);
header(summary,'F27:H27',['주문언어','전체 주문','주문 비중']);
for(let i=0;i<d.languages.length;i++){const row=i+28;summary.getRange(`F${row}:H${row}`).formulas=[[`='언어업종'!A${i+7}`,`='언어업종'!B${i+7}`,`='언어업종'!F${i+7}`]];}
number(summary,'G28:G33');number(summary,'H28:H33',pctFmt);
chart(summary,'A17:B24','국가별 주문수','E6','M23');
note(summary,'A28','후속 분석에 필요한 항목');
const notes=[
 d.scope.amounts_are_sums_confirmed?'금액 합계 기준 확인 완료. 통화별 완료 주문금액과 주문당 금액을 비교할 수 있습니다.':'금액이 행별 주문 합계인지 확인 필요. 확인 전 금액 해석은 잠정입니다.',
 d.totals.unknown_status_orders?`상태 정의 미확인 ${d.totals.unknown_status_orders.toLocaleString('en-US')}건은 별도 표시했습니다.`:'상태 코드 정의를 적용했습니다. 접수·진행 중 주문은 추출 시점 이후 바뀔 수 있습니다.',
 '다른 월을 같은 기준으로 추가하면 전월·전년 동월 및 동일 기간 성장률을 비교할 수 있습니다.',
 '회원 식별자가 없어 주문 계정 수·재주문율·사용자 리텐션은 계산하지 않습니다.',
 '자료의 국가·도시는 배달 지역, 언어는 주문언어로 사용합니다. 사용자 국적을 추정하지 않습니다.'
];notes.forEach((text,i)=>note(summary,`A${36+i}`,text));

// Verify that weighted order totals react to the input count, then restore.
const original=raw.getRange('L6').values[0][0];raw.getRange('L6').values=[[original+1]];
if(summary.getRange(`B${totalRow}`).values[0][0]!==d.totals.orders+1)throw new Error('Order totals fail recalculation');
raw.getRange('L6').values=[[original]];wb.recalculate();
if(summary.getRange(`B${totalRow}`).values[0][0]!==d.totals.orders)throw new Error('Total count mismatch');
for(let i=0;i<d.countries.length;i++)if(geo.getRange(`B${7+i}`).values[0][0]!==d.countries[i].orders)throw new Error('Country total mismatch');
for(let i=0;i<d.currency.length;i++)if(Math.abs(cur.getRange(`D${7+i}`).values[0][0]-Number(d.currency[i].completed_final_amount))>0.01)throw new Error('Currency completed amount mismatch');
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Final order report formula check'});
await fs.writeFile(path.join(output,'order-formula-check.json'),errors.ndjson);
const previewRanges={'주문요약':'A1:M42','국가도시':'A1:H29','언어업종':'A1:G29','국가언어':`A1:${endcol}15`,'통화금액':'A1:H20','집계자료':'A1:M13'};
for(const [sheetName,range] of Object.entries(previewRanges)){const blob=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(output,`preview-${sheetName}.png`),new Uint8Array(await blob.arrayBuffer()));}
const name=`주문집계_${d.scope.months[0].replace('-','')}${d.scope.months.length>1?'_'+d.scope.months.at(-1).replace('-',''):''}_분석.xlsx`;
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(output,name));
console.log(JSON.stringify({output:path.join(output,name),order_count:d.totals.orders,sheet_count:sheetNames.length,amounts_are_sums_confirmed:d.scope.amounts_are_sums_confirmed}));
