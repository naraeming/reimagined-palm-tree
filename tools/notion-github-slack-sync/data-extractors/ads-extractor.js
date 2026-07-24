import { Client } from '@notionhq/client';
import { NotionUtils } from '../notion-utils.js';

const NOTION_API_VERSION = '2025-09-03';

// 광고 운영관리 데이터베이스 ID (상위 데이터베이스)
const ADS_PARENT_DB_ID = '383292345a5281c5b79ac787ad0690c3';

export class AdsExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
    this.utils = new NotionUtils(token);
    this.dbMap = {}; // 데이터베이스 ID 캐시
  }

  /**
   * 광고 운영관리 페이지의 하위 데이터베이스들을 동적으로 탐색하여 캐시
   */
  async discoverDatabases() {
    if (Object.keys(this.dbMap).length > 0) {
      return; // 이미 탐색됨
    }

    try {
      console.log('🔍 광고 운영관리 하위 데이터베이스 탐색 중...');
      const childDbs = await this.utils.findChildDatabases(ADS_PARENT_DB_ID);

      for (const db of childDbs) {
        // 제목으로 데이터베이스 분류
        if (db.title.includes('캠페인')) {
          this.dbMap.campaigns = db.id;
          console.log(`  ✅ 캠페인 DB: ${db.id}`);
        } else if (db.title.includes('소재')) {
          this.dbMap.materials = db.id;
          console.log(`  ✅ 소재 DB: ${db.id}`);
        } else if (db.title.includes('오디언스')) {
          this.dbMap.audiences = db.id;
          console.log(`  ✅ 오디언스 DB: ${db.id}`);
        }
      }

      // 데이터베이스를 찾지 못한 경우 로깅
      if (!this.dbMap.campaigns) {
        console.warn('⚠️ 캠페인 DB를 찾지 못했습니다.');
      }
      if (!this.dbMap.materials) {
        console.warn('⚠️ 소재 DB를 찾지 못했습니다.');
      }
      if (!this.dbMap.audiences) {
        console.warn('⚠️ 오디언스 DB를 찾지 못했습니다.');
      }
    } catch (error) {
      console.error('데이터베이스 탐색 실패:', error.message);
    }
  }

  async extractCampaigns() {
    try {
      const dbId = this.dbMap.campaigns || '383292345a5281c5b79ac787ad0690c3';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
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
      const dbId = this.dbMap.materials || 'fallback-materials-db-id';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
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
      const dbId = this.dbMap.audiences || 'fallback-audiences-db-id';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
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
    // 먼저 하위 데이터베이스들을 탐색
    await this.discoverDatabases();

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
