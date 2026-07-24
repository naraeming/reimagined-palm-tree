import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

export class PerformanceExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractMonthlyReports() {
    try {
      const results = await this.client.databases.query({
        database_id: 'ef623abec9474f20ac29e9a4bf0d2b25',
        page_size: 100,
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
      console.error('Failed to extract monthly reports:', error.message);
      return [];
    }
  }

  async extractAll() {
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
