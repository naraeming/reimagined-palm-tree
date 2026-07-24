export class AdsCanvasBuilder {
  build(adsData) {
    const { campaigns, materials, audiences } = adsData;

    let md = `# 📢 광고 운영 관리\n\n`;
    md += `_마지막 업데이트: ${new Date().toISOString().split('T')[0]}_\n\n`;

    // 진행중인 캠페인
    const activeCampaigns = campaigns.filter((c) => c.status === '진행중');
    const completedCampaigns = campaigns.filter((c) => c.status === '종료');

    md += `## ✅ 진행중인 캠페인 (${activeCampaigns.length})\n\n`;
    if (activeCampaigns.length > 0) {
      md += `| 캠페인명 | 플랫폼 | 예산 | 목표 | 최근 변경 |\n`;
      md += `|---|---|---|---|---|\n`;

      for (const campaign of activeCampaigns.slice(0, 10)) {
        const goals = campaign.goals.join(', ') || '-';
        const budget = campaign.budget.toLocaleString('ko-KR');
        const change = campaign.recentChange || '생성 후 변경사항 없음';
        md += `| ${campaign.name} | ${campaign.platform} | ₫${budget} | ${goals} | ${change} |\n`;
      }
    } else {
      md += `*진행중인 캠페인 없음*\n`;
    }

    md += `\n## 📊 활성 소재 (${materials.filter((m) => m.status === '사용중').length})\n\n`;
    const activeMaterials = materials.filter((m) => m.status === '사용중').slice(0, 10);
    if (activeMaterials.length > 0) {
      md += `| 소재명 | 시작일 | 상태 |\n`;
      md += `|---|---|---|\n`;
      for (const material of activeMaterials) {
        md += `| ${material.name} | ${material.startDate} | ${material.status} |\n`;
      }
    } else {
      md += `*활성 소재 없음*\n`;
    }

    md += `\n## 🎯 오디언스 타겟풀 (${audiences.length})\n\n`;
    if (audiences.length > 0) {
      md += `| 타겟명 | 정의 | 최근 변경 |\n`;
      md += `|---|---|---|\n`;
      for (const audience of audiences.slice(0, 5)) {
        const def = audience.definition.substring(0, 50) + (audience.definition.length > 50 ? '...' : '');
        md += `| ${audience.name} | ${def} | ${audience.lastChanged} |\n`;
      }
    }

    md += `\n## 📈 통계\n\n`;
    md += `- 전체 캠페인: ${campaigns.length}개\n`;
    md += `  - 진행중: ${activeCampaigns.length}개\n`;
    md += `  - 종료: ${completedCampaigns.length}개\n`;
    md += `- 총 예산: ₫${activeCampaigns.reduce((sum, c) => sum + c.budget, 0).toLocaleString('ko-KR')}\n`;
    md += `- 활성 소재: ${activeMaterials.length}개\n`;

    return md;
  }
}
