import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

// 콘텐츠 제작관리 데이터베이스 ID
const CONTENT_DB_ID = '382292345a52811f823df9d152f65179';

export class ContentExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractCalendar() {
    try {
      console.log('  📊 콘텐츠 캘린더 추출 중...');
      const results = await this.client.databases.query({
        database_id: CONTENT_DB_ID,
        sorts: [
          {
            property: 'date:발행일:start',
            direction: 'descending',
          },
        ],
        page_size: 10,
      });

      return results.results.map((page) => ({
        id: page.id,
        title: page.properties['키워드/주제']?.rich_text?.[0]?.plain_text || 'Unknown',
        channels: page.properties.채널?.multi_select?.map((c) => c.name) || [],
        publishDate: page.properties['date:발행일:start']?.date || '',
        contentType: page.properties['콘텐츠 유형']?.multi_select?.map((t) => t.name) || [],
        category: page.properties.카테고리?.select?.name || '',
        postLink: page.properties['게시물 링크']?.url || '',
        topics: page.properties.주제?.relation || [],
        adLogs: page.properties['광고 사용 로그']?.relation || [],
        memo: page.properties['메모 ']?.rich_text?.[0]?.plain_text || '',
      }));
    } catch (error) {
      console.error('  ❌ 캘린더 추출 실패:', error.message);
      return [];
    }
  }

  async extractTopics() {
    try {
      console.log('  📊 콘텐츠 주제 추출 중...');
      const results = await this.client.databases.query({
        database_id: CONTENT_DB_ID,
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        title: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
        count: page.properties.횟수?.number || 0,
        recentUpdate: page.properties['date:최근 업데이트:start']?.date || '',
      }));
    } catch (error) {
      console.error('  ❌ 주제 추출 실패:', error.message);
      return [];
    }
  }

  async extractAll() {
    console.log('✍️ 콘텐츠 제작관리 데이터 추출...');
    const [calendar, topics] = await Promise.all([
      this.extractCalendar(),
      this.extractTopics(),
    ]);

    return {
      calendar,
      topics,
      timestamp: new Date().toISOString(),
    };
  }
}
