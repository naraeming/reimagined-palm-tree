import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

// DK 모닝 브리핑 데이터베이스 ID
const BRIEFING_DB_ID = 'f7641f65622d4ab19d302849d3b1366d';

export class BriefingExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractBriefings() {
    try {
      console.log('  📊 브리핑 추출 중...');
      const results = await this.client.databases.query({
        database_id: BRIEFING_DB_ID,
        sorts: [
          {
            property: 'date:기록일:start',
            direction: 'descending',
          },
        ],
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        date: page.properties['date:기록일:start']?.date || '',
        title: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
        content: page.properties.내용?.rich_text?.[0]?.plain_text || '',
        highlights: page.properties.주요포인트?.rich_text || [],
        action: page.properties.액션아이템?.rich_text?.[0]?.plain_text || '',
      }));
    } catch (error) {
      console.error('  ❌ 브리핑 추출 실패:', error.message);
      return [];
    }
  }

  async extractLatest(count = 7) {
    console.log('📌 DK 모닝 브리핑 데이터 추출...');
    const all = await this.extractBriefings();
    return {
      briefings: all.slice(0, count),
      total: all.length,
      timestamp: new Date().toISOString(),
    };
  }
}
