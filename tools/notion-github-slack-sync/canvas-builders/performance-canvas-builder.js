export class PerformanceCanvasBuilder {
  build(performanceData) {
    // all 배열로부터 월간/분기 필터링
    const all = performanceData.all || [];
    const monthly = all.filter((r) => r.type === '월간');
    const quarterly = all.filter((r) => r.type === '분기');
    const latest = performanceData.latest || monthly[0] || null;

    let md = `# 📊 성과·유저 분석\n\n`;
    md += `_마지막 업데이트: ${new Date().toISOString().split('T')[0]}_\n\n`;

    if (latest) {
      md += `## 🎯 최근 월간 리포트 (${latest.reportName})\n\n`;
      md += `| 지표 | 수치 |\n`;
      md += `|---|---|\n`;
      md += `| AF 주문수 | ${latest.afOrders.toLocaleString('ko-KR')} |\n`;
      md += `| GMV (USD) | $${latest.gmvUsd.toLocaleString('ko-KR')} |\n`;
      md += `| 월간 활성유저(MAU) | ${latest.mau.toLocaleString('ko-KR')}K |\n`;
      md += `| 앱DB 주문수 | ${latest.appDbOrders.toLocaleString('ko-KR')} |\n`;
      md += `| 주문 일치율 | ${latest.matchRate}% |\n`;
      md += `| iOS 주문비중 | ${latest.iosShare}% |\n`;
      md += `| 오가닉 비중 | ${latest.organicShare}% |\n`;
      md += `| 교민 비중 | ${latest.koreanShare}% |\n`;
      if (latest.aov > 0) md += `| AOV (USD) | $${latest.aov.toFixed(2)} |\n`;
      if (latest.activationRate > 0) md += `| 활성화율 | ${latest.activationRate}% |\n`;

      md += `\n**핵심 요약**\n\n`;
      md += `${latest.summary}\n`;
    }

    md += `\n## 📈 월간 추이 (${monthly.length}개월)\n\n`;
    if (monthly.length > 0) {
      md += `| 기준월 | AF 주문 | GMV (USD) | MAU | 교민% |\n`;
      md += `|---|---|---|---|---|\n`;

      for (const report of monthly.slice(0, 6)) {
        const period = report.period.substring(0, 7);
        const orders = report.afOrders.toLocaleString('ko-KR');
        const gmv = `$${(report.gmvUsd / 1000000).toFixed(2)}M`;
        const mau = `${report.mau}K`;
        const korean = `${report.koreanShare}%`;
        md += `| ${period} | ${orders} | ${gmv} | ${mau} | ${korean} |\n`;
      }
    }

    md += `\n## 🏆 분기 성과 (${quarterly.length}개)\n\n`;
    if (quarterly.length > 0) {
      md += `| 분기 | AF 주문 | GMV (USD) | 일치율 |\n`;
      md += `|---|---|---|---|\n`;

      for (const report of quarterly.slice(0, 4)) {
        const period = report.reportName.replace(' 월간 리포트', '').replace('분기 분석', '');
        const orders = report.afOrders.toLocaleString('ko-KR');
        const gmv = `$${(report.gmvUsd / 1000000).toFixed(2)}M`;
        const match = `${report.matchRate}%`;
        md += `| ${period} | ${orders} | ${gmv} | ${match} |\n`;
      }
    }

    md += `\n## 📊 주요 관찰\n\n`;
    if (monthly.length > 1) {
      const latest = monthly[0];
      const prev = monthly[1];
      const orderChange = ((latest.afOrders - prev.afOrders) / prev.afOrders * 100).toFixed(1);
      const gmvChange = ((latest.gmvUsd - prev.gmvUsd) / prev.gmvUsd * 100).toFixed(1);

      md += `- 주문 MoM: ${orderChange > 0 ? '+' : ''}${orderChange}%\n`;
      md += `- GMV MoM: ${gmvChange > 0 ? '+' : ''}${gmvChange}%\n`;
      md += `- 일치율: ${latest.matchRate}% (목표: >98%)\n`;
      md += `- 교민 비중: ${latest.koreanShare}% (추적 중)\n`;
    }

    return md;
  }
}
