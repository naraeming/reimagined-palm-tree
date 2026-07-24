export class CrossReference {
  /**
   * 광고-콘텐츠 매핑: 각 광고에 어떤 콘텐츠가 사용되는지
   */
  mapAdToContent(campaigns, materials, contentCalendar) {
    const adToContent = {};

    for (const campaign of campaigns) {
      adToContent[campaign.id] = {
        campaignName: campaign.name,
        materials: [],
        contentCount: 0,
      };

      // 이 캠페인에 사용되는 소재 찾기
      const campaignMaterials = materials.filter((m) => m.campaign === campaign.id);

      for (const material of campaignMaterials) {
        // 이 소재가 나온 콘텐츠 찾기
        const content = contentCalendar.find((c) => c.id === material.post);

        if (content) {
          adToContent[campaign.id].materials.push({
            materialName: material.name,
            contentTitle: content.title,
            contentId: content.id,
            publishDate: content.publishDate,
          });
          adToContent[campaign.id].contentCount++;
        }
      }
    }

    return adToContent;
  }

  /**
   * 콘텐츠-광고 매핑: 각 콘텐츠가 어떤 광고에 사용되는지
   */
  mapContentToAd(contentCalendar, campaigns) {
    const contentToAd = {};

    for (const content of contentCalendar) {
      contentToAd[content.id] = {
        contentTitle: content.title,
        campaigns: [],
        campaignCount: 0,
      };

      // 이 콘텐츠를 사용하는 광고 찾기
      for (const adLogId of content.adLogs) {
        const campaign = campaigns.find((c) => c.id === adLogId);
        if (campaign) {
          contentToAd[content.id].campaigns.push({
            campaignName: campaign.name,
            campaignId: campaign.id,
            platform: campaign.platform,
            status: campaign.status,
          });
          contentToAd[content.id].campaignCount++;
        }
      }
    }

    return contentToAd;
  }

  /**
   * 광고 Canvas에 콘텐츠 연동 정보 추가
   */
  enrichAdsCanvas(baseCanvas, adToContent) {
    let enhanced = baseCanvas;

    const crossRefSection = `\n## 🔗 사용 중인 콘텐츠\n\n`;
    let contentCount = 0;

    for (const [campaignId, mapping] of Object.entries(adToContent)) {
      if (mapping.materials.length > 0) {
        contentCount += mapping.materials.length;
      }
    }

    if (contentCount > 0) {
      enhanced += crossRefSection;
      enhanced += `**진행 중인 광고에 활용 중인 콘텐츠: ${contentCount}개**\n\n`;

      for (const [campaignId, mapping] of Object.entries(adToContent)) {
        if (mapping.materials.length > 0) {
          enhanced += `### ${mapping.campaignName}\n\n`;
          for (const material of mapping.materials) {
            enhanced += `- **${material.contentTitle}** (${material.publishDate})\n`;
          }
          enhanced += `\n`;
        }
      }
    }

    return enhanced;
  }

  /**
   * 콘텐츠 Canvas에 광고 연동 정보 추가
   */
  enrichContentCanvas(baseCanvas, contentToAd) {
    let enhanced = baseCanvas;

    const crossRefSection = `\n## 🔗 활용 중인 광고 캠페인\n\n`;
    let campaignCount = 0;

    for (const [contentId, mapping] of Object.entries(contentToAd)) {
      if (mapping.campaigns.length > 0) {
        campaignCount += mapping.campaigns.length;
      }
    }

    if (campaignCount > 0) {
      enhanced += crossRefSection;
      enhanced += `**활용 중인 광고 캠페인: ${campaignCount}개**\n\n`;

      for (const [contentId, mapping] of Object.entries(contentToAd)) {
        if (mapping.campaigns.length > 0) {
          enhanced += `### ${mapping.contentTitle}\n\n`;
          for (const campaign of mapping.campaigns) {
            enhanced += `- **${campaign.campaignName}** (${campaign.platform}, ${campaign.status})\n`;
          }
          enhanced += `\n`;
        }
      }
    }

    return enhanced;
  }

  /**
   * 전체 매핑 생성
   */
  generateMapping(campaigns, materials, contentCalendar) {
    const adToContent = this.mapAdToContent(campaigns, materials, contentCalendar);
    const contentToAd = this.mapContentToAd(contentCalendar, campaigns);

    return {
      adToContent,
      contentToAd,
      totalConnections: Object.values(adToContent).reduce((sum, m) => sum + m.contentCount, 0),
    };
  }
}
