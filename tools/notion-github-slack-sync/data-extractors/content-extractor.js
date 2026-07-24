import { Client } from '@notionhq/client';
import { NotionUtils } from '../notion-utils.js';

const NOTION_API_VERSION = '2025-09-03';

// 콘텐츠 제작관리 데이터베이스 ID (상위 데이터베이스)
const CONTENT_PARENT_DB_ID = '382292345a52811f823df9d152f65179';

export class ContentExtractor {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
    this.utils = new NotionUtils(token);
    this.dbMap = {}; // 데이터베이스 ID 캐시
  }

  /**
   * 콘텐츠 제작관리 페이지의 하위 데이터베이스들을 동적으로 탐색하여 캐시
   */
  async discoverDatabases() {
    if (Object.keys(this.dbMap).length > 0) {
      return; // 이미 탐색됨
    }

    try {
      console.log('🔍 콘텐츠 제작관리 하위 데이터베이스 탐색 중...');
      const childDbs = await this.utils.findChildDatabases(CONTENT_PARENT_DB_ID);

      for (const db of childDbs) {
        // 제목으로 데이터베이스 분류
        if (db.title.includes('캘린더') || db.title.includes('일정')) {
          this.dbMap.calendar = db.id;
          console.log(`  ✅ 캘린더 DB: ${db.id}`);
        } else if (db.title.includes('주제') || db.title.includes('토픽')) {
          this.dbMap.topics = db.id;
          console.log(`  ✅ 주제 DB: ${db.id}`);
        }
      }

      // 데이터베이스를 찾지 못한 경우 로깅
      if (!this.dbMap.calendar) {
        console.warn('⚠️ 캘린더 DB를 찾지 못했습니다.');
      }
      if (!this.dbMap.topics) {
        console.warn('⚠️ 주제 DB를 찾지 못했습니다.');
      }
    } catch (error) {
      console.error('데이터베이스 탐색 실패:', error.message);
    }
  }

  async extractCalendar() {
    try {
      const dbId = this.dbMap.calendar || '382292345a52811f823df9d152f65179';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
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
      const dbId = this.dbMap.topics || 'fallback-topics-db-id';
      const results = await this.utils.queryDatabase(dbId);

      return results.map((page) => ({
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
    // 먼저 하위 데이터베이스들을 탐색
    await this.discoverDatabases();

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
