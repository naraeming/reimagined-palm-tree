import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

export class BriefingExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractBriefings() {
    try {
      const results = await this.client.databases.query({
        database_id: 'f7641f65622d4ab19d302849d3b1366d',
        page_size: 50,
      });

      return results.results
        .sort((a, b) => {
          const dateA = a.properties['date:기록일:start']?.date || '1900-01-01';
          const dateB = b.properties['date:기록일:start']?.date || '1900-01-01';
          return dateB.localeCompare(dateA);
        })
        .map((page) => ({
          id: page.id,
          date: page.properties['date:기록일:start']?.date || '',
          title: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
          content: page.properties.내용?.rich_text?.[0]?.plain_text || '',
          highlights: page.properties.주요포인트?.rich_text || [],
          action: page.properties.액션아이템?.rich_text?.[0]?.plain_text || '',
        }));
    } catch (error) {
      console.error('Failed to extract briefings:', error.message);
      return [];
    }
  }

  async extractLatest(count = 7) {
    const all = await this.extractBriefings();
    return {
      briefings: all.slice(0, count),
      total: all.length,
      timestamp: new Date().toISOString(),
    };
  }
}
