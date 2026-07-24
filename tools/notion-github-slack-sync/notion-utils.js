import { Client } from '@notionhq/client';

const NOTION_API_VERSION = '2025-09-03';

/**
 * Notion API의 동적 데이터베이스 탐색 유틸리티
 */
export class NotionUtils {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
  }

  /**
   * 주어진 페이지 ID의 자식 데이터베이스들을 모두 탐색
   * @param {string} pageId - 탐색할 페이지 ID
   * @returns {Promise<Array>} 자식 데이터베이스 정보 배열 [{id, title}, ...]
   */
  async findChildDatabases(pageId) {
    try {
      const databases = [];
      let cursor = undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
        });

        for (const block of response.results) {
          if (block.type === 'child_database') {
            databases.push({
              id: block.id,
              title: block.child_database.title,
            });
          }
        }

        cursor = response.next_cursor;
        hasMore = response.has_more;
      }

      return databases;
    } catch (error) {
      console.error(`Failed to find child databases for ${pageId}:`, error.message);
      return [];
    }
  }

  /**
   * 주어진 데이터베이스를 쿼리
   * @param {string} databaseId - 데이터베이스 ID
   * @param {Object} options - 쿼리 옵션
   * @returns {Promise<Array>} 쿼리 결과
   */
  async queryDatabase(databaseId, options = {}) {
    try {
      const results = await this.client.databases.query({
        database_id: databaseId,
        page_size: 100,
        ...options,
      });
      return results.results;
    } catch (error) {
      console.error(`Failed to query database ${databaseId}:`, error.message);
      return [];
    }
  }

  /**
   * 데이터베이스 메타데이터 조회
   * @param {string} databaseId - 데이터베이스 ID
   * @returns {Promise<Object>} 데이터베이스 정보
   */
  async getDatabaseMetadata(databaseId) {
    try {
      return await this.client.databases.retrieve({
        database_id: databaseId,
      });
    } catch (error) {
      console.error(`Failed to get database metadata for ${databaseId}:`, error.message);
      return null;
    }
  }
}
