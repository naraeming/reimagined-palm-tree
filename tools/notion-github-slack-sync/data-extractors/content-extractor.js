import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

export class ContentExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  async extractCalendar() {
    try {
      const results = await this.client.databases.query({
        database_id: '6e754eb6e7a54fa79c18b7ecd8c36166',
        page_size: 100,
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
      console.error('Failed to extract calendar:', error.message);
      return [];
    }
  }

  async extractTopics() {
    try {
      const results = await this.client.databases.query({
        database_id: '88ddc06202ce43048d06ecdbb6ed9d18',
        page_size: 100,
      });

      return results.results.map((page) => ({
        id: page.id,
        title: page.properties.Title?.title?.[0]?.plain_text || 'Unknown',
        count: page.properties.횟수?.number || 0,
        recentUpdate: page.properties['date:최근 업데이트:start']?.date || '',
      }));
    } catch (error) {
      console.error('Failed to extract topics:', error.message);
      return [];
    }
  }

  async extractAll() {
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
