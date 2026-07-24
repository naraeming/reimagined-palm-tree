import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

// 광고 운영관리 데이터베이스 ID
const ADS_DB_ID = '383292345a5281c5b79ac787ad0690c3';

export class AdsExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractCampaigns() {
    try {
      console.log('  📊 캠페인 추출 중...');
      const results = await this.client.databases.query({
        database_id: ADS_DB_ID,
        sorts: [
          {
            property: 'date:시작일:start',
            direction: 'descending',
          },
        ],
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
      console.error('  ❌ 캠페인 추출 실패:', error.message);
      return [];
    }
  }

  async extractMaterials() {
    try {
      console.log('  📊 소재 추출 중...');
      const results = await this.client.databases.query({
        database_id: ADS_DB_ID,
        sorts: [
          {
            property: 'date:사용 시작일:start',
            direction: 'descending',
          },
        ],
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
      console.error('  ❌ 소재 추출 실패:', error.message);
      return [];
    }
  }

  async extractAudiences() {
    try {
      console.log('  📊 오디언스 추출 중...');
      const results = await this.client.databases.query({
        database_id: ADS_DB_ID,
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        name: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
        definition: page.properties.정의?.rich_text?.[0]?.plain_text || '',
        lastChanged: page.properties['date:변경일:start']?.date || '',
      }));
    } catch (error) {
      console.error('  ❌ 오디언스 추출 실패:', error.message);
      return [];
    }
  }

  async extractAll() {
    console.log('📢 광고 운영관리 데이터 추출...');
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
