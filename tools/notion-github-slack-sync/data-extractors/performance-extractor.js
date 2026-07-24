import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

// 성과·유저분석 데이터베이스 ID
const PERFORMANCE_DB_ID = '39f292345a5281f4bfdfea7ad739976b';

export class PerformanceExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractMonthlyReports() {
    try {
      console.log('  📊 월간 리포트 추출 중...');
      const results = await this.client.databases.query({
        database_id: PERFORMANCE_DB_ID,
        filter: {
          property: '구분',
          select: {
            equals: '월간',
          },
        },
        sorts: [
          {
            property: 'date:기준월:start',
            direction: 'descending',
          },
        ],
        page_size: 12,
      });

      return results.results.map((page) => ({
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
      console.error('  ❌ 월간 리포트 추출 실패:', error.message);
      return [];
    }
  }

  async extractQuarterlyReports() {
    try {
      console.log('  📊 분기 리포트 추출 중...');
      const results = await this.client.databases.query({
        database_id: PERFORMANCE_DB_ID,
        filter: {
          property: '구분',
          select: {
            equals: '분기',
          },
        },
        sorts: [
          {
            property: 'date:기준월:start',
            direction: 'descending',
          },
        ],
        page_size: 4,
      });

      return results.results.map((page) => ({
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
      console.error('  ❌ 분기 리포트 추출 실패:', error.message);
      return [];
    }
  }

  async extractAll() {
    console.log('📊 성과·유저분석 데이터 추출...');
    const [monthly, quarterly] = await Promise.all([
      this.extractMonthlyReports(),
      this.extractQuarterlyReports(),
    ]);

    return {
      monthly,
      quarterly,
      latest: monthly[0] || null,
      timestamp: new Date().toISOString(),
    };
  }
}
