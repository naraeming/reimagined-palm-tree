import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export class FileSystemPublisher {
  constructor(mirrorDir) {
    this.mirrorDir = mirrorDir;
  }

  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  getFullPath(relativePath) {
    return join(this.mirrorDir, relativePath);
  }

  async writeFile(relativePath, content) {
    const fullPath = this.getFullPath(relativePath);
    await this.ensureDir(dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async deleteFile(relativePath) {
    const fullPath = this.getFullPath(relativePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async deleteDir(relativePath) {
    const fullPath = this.getFullPath(relativePath);
    try {
      await fs.rm(fullPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async publish(tree, diff) {
    const summary = {
      filesWritten: 0,
      filesDeleted: 0,
      filesMoved: 0,
      errors: [],
    };

    // Initialize mirror directory
    await this.ensureDir(this.mirrorDir);

    // Write new/updated pages
    for (const item of diff.toWrite) {
      try {
        const { entry, type } = item;
        const node = this.findNodeById(tree, item.id);

        if (!node) continue;

        if (node.type === 'page' && !node.hasChildren) {
          // Flat page file
          await this.writeFile(`${entry.path}.md`, node.markdown);
        } else if (node.type === 'page' && node.hasChildren) {
          // Folder with _index.md
          await this.writeFile(`${entry.path}/_index.md`, node.markdown);
        } else if (node.type === 'database') {
          // Database: _index.md (table) + rows/
          const tableMarkdown = this.generateDatabaseTable(node);
          await this.writeFile(`${entry.path}/_index.md`, tableMarkdown);

          // Write individual rows
          for (const row of node.children) {
            if (row.markdown.trim()) {
              await this.writeFile(`${row.path}.md`, row.markdown);
            }
          }
        } else if (node.type === 'database-row') {
          // Individual row in database
          if (node.markdown.trim()) {
            await this.writeFile(`${entry.path}.md`, node.markdown);
          }
        }

        summary.filesWritten++;
      } catch (error) {
        summary.errors.push(`Failed to write ${item.id}: ${error.message}`);
      }
    }

    // Delete removed pages/databases
    for (const item of diff.toDelete) {
      try {
        const { path } = item;
        await this.deleteFile(`${path}.md`);
        await this.deleteDir(`${path}`);
        summary.filesDeleted++;
      } catch (error) {
        // Ignore file not found errors
      }
    }

    // Note: actual git-level move operations happen in git-publish.js
    // Here we just track that they happened
    summary.filesMoved = diff.toMove.length;

    return summary;
  }

  /**
   * 전체 트리를 재귀적으로 마크다운 파일로 작성 (diff 없이)
   * @param {Object} tree - Notion 트리 구조
   * @returns {Promise<Object>} 작성 요약
   */
  async publishTree(tree) {
    const summary = {
      filesWritten: 0,
      filesDeleted: 0,
      errors: [],
    };

    if (!tree) {
      return summary;
    }

    // Initialize mirror directory
    await this.ensureDir(this.mirrorDir);

    // 재귀적으로 트리 작성
    const writeTreeNode = async (node, parentPath = '') => {
      if (!node) return;

      try {
        const nodePath = node.path || `${parentPath}/${node.slug || 'node'}`;

        if (node.type === 'page') {
          // 페이지 저장
          if (node.hasChildren) {
            // 자식이 있으면 _index.md로 저장
            await this.writeFile(`${nodePath}/_index.md`, node.markdown || '');
          } else {
            // 자식이 없으면 .md로 저장
            await this.writeFile(`${nodePath}.md`, node.markdown || '');
          }
          summary.filesWritten++;

          // 자식 노드들 처리
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              await writeTreeNode(child, nodePath);
            }
          }
        } else if (node.type === 'database') {
          // 데이터베이스 테이블 저장
          const tableMarkdown = this.generateDatabaseTable(node);
          await this.writeFile(`${nodePath}/_index.md`, tableMarkdown);
          summary.filesWritten++;

          // 각 행 저장
          if (node.children && Array.isArray(node.children)) {
            for (const row of node.children) {
              await writeTreeNode(row, `${nodePath}/rows`);
            }
          }
        } else if (node.type === 'database-row') {
          // 데이터베이스 행 저장
          if (node.markdown && node.markdown.trim()) {
            await this.writeFile(`${nodePath}.md`, node.markdown);
            summary.filesWritten++;
          }
        }
      } catch (error) {
        summary.errors.push(`Failed to write ${node.title || node.id}: ${error.message}`);
      }
    };

    // 트리 작성 시작
    await writeTreeNode(tree);

    return summary;
  }

  findNodeById(tree, id) {
    if (tree.id === id) return tree;
    if (!tree.children) return null;

    for (const child of tree.children) {
      const found = this.findNodeById(child, id);
      if (found) return found;
    }

    return null;
  }

  generateDatabaseTable(database) {
    const { title, description, properties, children } = database;

    let md = `# ${title}\n\n`;
    if (description) {
      md += `${description}\n\n`;
    }

    // Build markdown table from database properties and rows
    if (children.length === 0) {
      md += '*(Empty database)*\n';
      return md;
    }

    // Get all property keys
    const propKeys = Object.keys(properties);

    // Table header
    md += '| ' + propKeys.map((k) => properties[k].name).join(' | ') + ' |\n';
    md += '| ' + propKeys.map(() => '---').join(' | ') + ' |\n';

    // Table rows
    for (const row of children) {
      const cells = propKeys.map((key) => {
        const prop = row.properties[key];
        return this.formatPropertyValue(prop);
      });
      md += '| ' + cells.join(' | ') + ' |\n';
    }

    md += '\n';
    return md;
  }

  formatPropertyValue(property) {
    if (!property) return '';

    switch (property.type) {
      case 'title':
        return property.title?.map((t) => t.plain_text).join('') || '';
      case 'rich_text':
        return property.rich_text?.map((t) => t.plain_text).join('') || '';
      case 'number':
        return String(property.number ?? '');
      case 'select':
        return property.select?.name || '';
      case 'multi_select':
        return property.multi_select?.map((s) => s.name).join(', ') || '';
      case 'date':
        return property.date?.start || '';
      case 'checkbox':
        return property.checkbox ? '✓' : '';
      case 'url':
        return property.url || '';
      default:
        return '';
    }
  }
}
