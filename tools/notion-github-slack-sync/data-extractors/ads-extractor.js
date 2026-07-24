import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

export class AdsExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractCampaigns() {
    const dataSourceUrl = 'collection://b62221dc-8406-4227-a80c-01b054045826';
    const campaignsQuery = `SELECT * FROM "${dataSourceUrl}" ORDER BY date:최근 캠페인 변경일:start DESC`;

    try {
      const results = await this.client.databases.query({
        database_id: 'b62221dc-8406-4227-a80c-01b054045826',
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        name: page.properties.캠페인명?.title?.[0]?.plain_text || 'Unknown',
        platform: page.properties.플랫폼?.select?.name || '',
        status: page.properties.상태?.select?.name || '',
        budget: page.properties['예산(₫)']?.number || 0,
        goals: page.properties.목표?.multi_select?.map((g) => g.name) || [],
        startDate: page.properties['date:시작일:start']?.date || '',
        endDate: page.properties['date:종료일:start']?.date || '',
        lastChanged: page.properties['date:최근 캠페인 변경일:start']?.date || '',
        target: page.properties.타겟?.rich_text?.[0]?.plain_text || '',
        regions: page.properties['시장/지역']?.multi_select?.map((r) => r.name) || [],
        materials: page.properties['사용 소재 로그']?.relation || [],
        recentChange: page.properties.캠페인_최근_변경사항?.rich_text?.[0]?.plain_text || '',
      }));
    } catch (error) {
      console.error('Failed to extract campaigns:', error.message);
      return [];
    }
  }

  async extractMaterials() {
    try {
      const results = await this.client.databases.query({
        database_id: '837ccd1b8e994f3ba89f4df28bcdeb75',
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        name: page.properties['사용 기록']?.rich_text?.[0]?.plain_text || 'Unknown',
        campaign: page.properties.캠페인?.relation?.[0]?.id || '',
        post: page.properties.게시물?.relation?.[0]?.id || '',
        startDate: page.properties['date:사용 시작일:start']?.date || '',
        endDate: page.properties['date:사용 종료일:start']?.date || '',
        status: page.properties['사용 상태']?.select?.name || '',
        memo: page.properties.메모?.rich_text?.[0]?.plain_text || '',
      }));
    } catch (error) {
      console.error('Failed to extract materials:', error.message);
      return [];
    }
  }

  async extractAudiences() {
    try {
      const results = await this.client.databases.query({
        database_id: 'a9c6d76dca10416e94dcb6dc3c06b04d',
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        name: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
        definition: page.properties.정의?.rich_text?.[0]?.plain_text || '',
        lastChanged: page.properties['date:변경일:start']?.date || '',
      }));
    } catch (error) {
      console.error('Failed to extract audiences:', error.message);
      return [];
    }
  }

  async extractAll() {
    const [campaigns, materials, audiences] = await Promise.all([
      this.extractCampaigns(),
      this.extractMaterials(),
      this.extractAudiences(),
    ]);

    return {
      campaigns,
      materials,
      audiences,
      timestamp: new Date().toISOString(),
    };
  }
}
