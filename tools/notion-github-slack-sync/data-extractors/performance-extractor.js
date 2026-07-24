import { Client } from '@notionhq/client';
import { NotionUtils } from '../notion-utils.js';

const NOTION_API_VERSION = '2025-09-03';

// 성과·유저분석 데이터베이스 ID (상위 데이터베이스)
const PERFORMANCE_PARENT_DB_ID = '39f292345a5281f4bfdfea7ad739976b';

export class PerformanceExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
    this.utils = new NotionUtils(token);
    this.dbMap = {}; // 데이터베이스 ID 캐시
  }

  /**
   * 성과·유저분석 페이지의 하위 데이터베이스들을 동적으로 탐색하여 캐시
   */
  async discoverDatabases() {
    if (Object.keys(this.dbMap).length > 0) {
      return; // 이미 탐색됨
    }

    try {
      console.log('🔍 성과·유저분석 하위 데이터베이스 탐색 중...');
      const childDbs = await this.utils.findChildDatabases(PERFORMANCE_PARENT_DB_ID);

      for (const db of childDbs) {
        // 제목으로 데이터베이스 분류
        if (db.title.includes('월간') || db.title.includes('리포트')) {
          this.dbMap.reports = db.id;
          console.log(`  ✅ 리포트 DB: ${db.id}`);
        }
      }

      // 데이터베이스를 찾지 못한 경우 로깅
      if (!this.dbMap.reports) {
        console.warn('⚠️ 리포트 DB를 찾지 못했습니다.');
      }
    } catch (error) {
      console.error('데이터베이스 탐색 실패:', error.message);
    }
  }

  async extractMonthlyReports() {
    try {
      const dbId = this.dbMap.reports || '39f292345a5281f4bfdfea7ad739976b';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
        id: page.id,
        reportName: page.properties.리포트?.title?.[0]?.plain_text || 'Unknown',
        period: page.properties['date:기준월:start']?.date || '',
        type: page.properties.구분?.select?.name || '',
        afOrders: page.properties['AF 주문수']?.number || 0,
        appDbOrders: page.properties['앱DB 주문수']?.number || 0,
        gmvUsd: page.properties['GMV (USD)']?.number || 0,
        mau: page.properties['월간 활성유저(MAU)']?.number || 0,
        iosShare: page.properties['iOS 주문비중(%)']?.number || 0,
        matchRate: page.properties['주문 일치율(%)']?.number || 0,
        organicShare: page.properties['오가닉 비중(%)']?.number || 0,
        koreanShare: page.properties['교민 비중(%)']?.number || 0,
        repeat5Share: page.properties['5회+ 매출비중(%)']?.number || 0,
        aov: page.properties['AOV(USD)']?.number || 0,
        activationRate: page.properties['활성화율(%)']?.number || 0,
        summary: page.properties['핵심 요약']?.rich_text?.[0]?.plain_text || '',
      }));
    } catch (error) {
      console.error('Failed to extract monthly reports:', error.message);
      return [];
    }
  }

  async extractAll() {
    // 먼저 하위 데이터베이스들을 탐색
    await this.discoverDatabases();

    const reports = await this.extractMonthlyReports();

    // 월간/분기 분리
    const monthly = reports.filter((r) => r.type === '월간').slice(0, 12);
    const quarterly = reports.filter((r) => r.type === '분기').slice(0, 4);

    return {
      monthly,
      quarterly,
      latest: monthly[0] || null,
      timestamp: new Date().toISOString(),
    };
  }
}
