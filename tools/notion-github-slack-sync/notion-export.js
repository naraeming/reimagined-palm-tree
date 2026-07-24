import { Client } from '@notionhq/client';
import { blockListToMarkdown } from './blocks-to-markdown.js';
import { createHash } from 'node:crypto';

const NOTION_API_VERSION = '2025-09-03';

export class NotionExporter {
  constructor(token) {
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
    });
    this.visited = new Set();
    this.blockCache = new Map();
  }

  sanitizeSlug(title) {
    return title
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\w一-鿿가-힯-]/g, '')
      .substring(0, 100);
  }

  shortHash(pageId) {
    return createHash('md5').update(pageId).digest('hex').substring(0, 4);
  }

  getSlug(title, pageId) {
    return `${this.sanitizeSlug(title)}-${this.shortHash(pageId)}`;
  }

  computeContentHash(markdown) {
    return createHash('sha256').update(markdown).digest('hex');
  }

  async getPageBlockChildren(pageId) {
    const blocks = [];
    let cursor;

    try {
      while (true) {
        const response = await this.client.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        });

        blocks.push(...response.results);
        if (!response.has_more) break;
        cursor = response.next_cursor;
      }
    } catch (error) {
      console.warn(`Failed to fetch children for ${pageId}: ${error.message}`);
    }

    return blocks;
  }

  async renderBlocksToMarkdown(blocks) {
    const getChildren = (blockId) => this.getPageBlockChildren(blockId);
    return blockListToMarkdown(blocks, getChildren);
  }

  validateId(id) {
    // Notion IDs should be 32 hex characters or UUID format
    if (!id || typeof id !== 'string') {
      throw new Error(`Invalid ID type: ${typeof id}`);
    }
    // Remove hyphens for comparison
    const cleanId = id.replace(/-/g, '');
    if (!/^[a-f0-9]{32}$/i.test(cleanId)) {
      console.warn(`⚠️ Unusual ID format: ${id} (cleaned: ${cleanId})`);
    }
  }

  async fetchPage(pageId) {
    try {
      this.validateId(pageId);
      return await this.client.pages.retrieve({ page_id: pageId });
    } catch (error) {
      // Check if error is about ID being a database
      if (error.message && error.message.includes('is a database')) {
        console.warn(`⚠️ ID ${pageId} is a database, not a page. Skipping.`);
        return null;
      }
      console.warn(`Failed to fetch page ${pageId}: ${error.message}`);
      return null;
    }
  }

  async fetchDatabase(databaseId) {
    try {
      this.validateId(databaseId);
      return await this.client.databases.retrieve({ database_id: databaseId });
    } catch (error) {
      console.warn(`Failed to fetch database ${databaseId}: ${error.message}`);
      return null;
    }
  }

  async queryDatabase(databaseId) {
    const rows = [];
    let cursor;

    try {
      this.validateId(databaseId);
      while (true) {
        const response = await this.client.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
        });

        rows.push(...response.results);
        if (!response.has_more) break;
        cursor = response.next_cursor;
      }
    } catch (error) {
      if (error.message && error.message.includes('Invalid request URL')) {
        console.error(`❌ Invalid Notion API request for database ${databaseId}:`);
        console.error(`   Error: ${error.message}`);
        console.error(`   This might be due to an invalid ID format or database structure`);
      } else {
        console.warn(`Failed to query database ${databaseId}: ${error.message}`);
      }
    }

    return rows;
  }

  getPageTitle(page) {
    if (page.properties.title) {
      return page.properties.title.title?.[0]?.plain_text || 'Untitled';
    }
    // Try to find a title property (Notion's title might be in different property)
    for (const [, prop] of Object.entries(page.properties)) {
      if (prop.type === 'title') {
        return prop.title?.[0]?.plain_text || 'Untitled';
      }
    }
    return 'Untitled';
  }

  async crawlPage(pageId, parentPath = '') {
    if (this.visited.has(pageId)) {
      return null;
    }
    this.visited.add(pageId);

    const page = await this.fetchPage(pageId);
    if (!page) return null;

    const title = this.getPageTitle(page);
    const slug = this.getSlug(title, pageId);
    const blocks = await this.getPageBlockChildren(pageId);
    const markdown = await this.renderBlocksToMarkdown(blocks);
    const contentHash = this.computeContentHash(markdown);

    const children = [];
    let hasChildren = false;

    // Process child pages and databases
    for (const block of blocks) {
      if (block.type === 'child_page') {
        hasChildren = true;
        const childPage = await this.crawlPage(block.id, `${parentPath}/${slug}`);
        if (childPage) children.push(childPage);
      } else if (block.type === 'child_database') {
        hasChildren = true;
        const childDb = await this.crawlDatabase(block.id, `${parentPath}/${slug}`);
        if (childDb) children.push(childDb);
      }
    }

    return {
      id: pageId,
      type: 'page',
      title,
      slug,
      markdown,
      contentHash,
      lastEdited: page.last_edited_time,
      path: `${parentPath}/${slug}`,
      hasChildren,
      children,
    };
  }

  async crawlDatabase(databaseId, parentPath = '') {
    if (this.visited.has(databaseId)) {
      return null;
    }
    this.visited.add(databaseId);

    const database = await this.fetchDatabase(databaseId);
    if (!database) return null;

    const title = database.title?.[0]?.plain_text || 'Untitled Database';
    const slug = this.getSlug(title, databaseId);
    const rows = await this.queryDatabase(databaseId);

    const dbChildren = [];
    for (const row of rows) {
      const rowTitle = this.getPageTitle(row);
      const rowSlug = this.getSlug(rowTitle, row.id);
      const rowBlocks = await this.getPageBlockChildren(row.id);
      const rowMarkdown = await this.renderBlocksToMarkdown(rowBlocks);
      const contentHash = this.computeContentHash(rowMarkdown);

      dbChildren.push({
        id: row.id,
        type: 'database-row',
        title: rowTitle,
        slug: rowSlug,
        markdown: rowMarkdown,
        contentHash,
        lastEdited: row.last_edited_time,
        properties: row.properties,
        path: `${parentPath}/${slug}/rows/${rowSlug}`,
      });
    }

    return {
      id: databaseId,
      type: 'database',
      title,
      slug,
      description: database.description?.[0]?.plain_text || '',
      properties: database.properties,
      contentHash: '', // DBs don't have body content
      lastEdited: database.last_edited_time,
      path: `${parentPath}/${slug}`,
      hasChildren: dbChildren.length > 0,
      children: dbChildren,
    };
  }

  async exportWorkspace(rootPageId) {
    this.visited.clear();
    return this.crawlPage(rootPageId);
  }
}
