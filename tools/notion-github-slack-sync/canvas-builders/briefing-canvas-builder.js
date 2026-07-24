export class BriefingCanvasBuilder {
  build(briefingData) {
    const { briefings } = briefingData;

    let md = `# 📌 DK 모닝 브리핑\n\n`;
    md += `_마지막 업데이트: ${new Date().toISOString().split('T')[0]}_\n\n`;

    if (briefings.length === 0) {
      md += `*오늘의 브리핑이 아직 준비되지 않았습니다.*\n`;
      return md;
    }

    const today = briefings[0];

    md += `## 📅 ${today.date}\n\n`;

    if (today.content) {
      md += `**핵심 요약**\n\n`;
      md += `${today.content}\n\n`;
    }

    if (today.highlights && today.highlights.length > 0) {
      md += `## ⭐ 주요 포인트\n\n`;
      for (const highlight of today.highlights) {
        md += `- ${highlight.plain_text}\n`;
      }
      md += `\n`;
    }

    if (today.action) {
      md += `## 🎯 액션 아이템\n\n`;
      md += `${today.action}\n\n`;
    }

    md += `---\n\n`;
    md += `## 📋 최근 브리핑 히스토리\n\n`;

    if (briefings.length > 1) {
      md += `| 날짜 | 제목 |\n`;
      md += `|---|---|\n`;

      for (const briefing of briefings.slice(1, 8)) {
        md += `| ${briefing.date} | ${briefing.title} |\n`;
      }
    }

    return md;
  }
}
