export class ContentCanvasBuilder {
  build(contentData) {
    const { calendar, topics } = contentData;

    let md = `# ✍️ 콘텐츠 제작 관리\n\n`;
    md += `_마지막 업데이트: ${new Date().toISOString().split('T')[0]}_\n\n`;

    // 최근 발행 콘텐츠
    const recentContent = calendar.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate)).slice(0, 10);

    md += `## 📅 최근 발행 콘텐츠 (${recentContent.length})\n\n`;
    if (recentContent.length > 0) {
      md += `| 제목 | 채널 | 유형 | 발행일 | 광고 사용 |\n`;
      md += `|---|---|---|---|---|\n`;

      for (const content of recentContent) {
        const channels = content.channels.join(', ') || '-';
        const types = content.contentType.join(', ') || '-';
        const adCount = content.adLogs.length > 0 ? `✓ ${content.adLogs.length}개` : '-';
        md += `| ${content.title} | ${channels} | ${types} | ${content.publishDate} | ${adCount} |\n`;
      }
    }

    md += `\n## 🏷️ 주제별 집계 (${topics.length})\n\n`;
    const sortedTopics = topics.sort((a, b) => b.count - a.count);
    if (sortedTopics.length > 0) {
      md += `| 주제 | 횟수 |\n`;
      md += `|---|---|\n`;
      for (const topic of sortedTopics.slice(0, 10)) {
        md += `| ${topic.title} | ${topic.count}회 |\n`;
      }
    }

    md += `\n## 📊 채널별 분포\n\n`;
    const channelStats = {};
    for (const content of calendar) {
      for (const channel of content.channels) {
        channelStats[channel] = (channelStats[channel] || 0) + 1;
      }
    }

    for (const [channel, count] of Object.entries(channelStats).sort((a, b) => b[1] - a[1])) {
      md += `- ${channel}: ${count}개\n`;
    }

    md += `\n## 📈 통계\n\n`;
    md += `- 총 콘텐츠: ${calendar.length}개\n`;
    md += `- 이번 달: ${calendar.filter((c) => new Date(c.publishDate).getMonth() === new Date().getMonth()).length}개\n`;
    md += `- 활용 중인 광고 캠페인: ${new Set(calendar.flatMap((c) => c.adLogs)).size}개\n`;

    return md;
  }
}
