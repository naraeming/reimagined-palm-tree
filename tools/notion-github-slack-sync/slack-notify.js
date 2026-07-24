export class SlackNotifier {
  constructor(botToken, channelId, dryRun = false) {
    this.botToken = botToken;
    this.channelId = channelId;
    this.dryRun = dryRun;
  }

  async callSlackApi(method, params) {
    const url = `https://slack.com/api/${method}`;
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    };

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error} (${method})`);
      }

      return data;
    } catch (error) {
      console.error(`Failed to call ${method}:`, error.message);
      throw error;
    }
  }

  async postMessage(text, blocks = null) {
    if (this.dryRun) {
      console.log('[DRY-RUN] Would post Slack message:', text);
      return { dryRun: true };
    }

    try {
      const result = await this.callSlackApi('chat.postMessage', {
        channel: this.channelId,
        text,
        blocks: blocks || undefined,
      });

      return {
        success: true,
        ts: result.ts,
      };
    } catch (error) {
      console.error('Failed to post message:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createCanvas(title, documentContent) {
    if (this.dryRun) {
      console.log('[DRY-RUN] Would create canvas:', title);
      return { dryRun: true, canvasId: 'F000DRY' };
    }

    try {
      const result = await this.callSlackApi('conversations.canvases.create', {
        channel_id: this.channelId,
        document_content: {
          type: 'markdown',
          markdown: documentContent,
        },
      });

      return {
        success: true,
        canvasId: result.canvas_id,
      };
    } catch (error) {
      console.error('Failed to create canvas:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async updateCanvas(canvasId, documentContent) {
    if (this.dryRun) {
      console.log('[DRY-RUN] Would update canvas:', canvasId);
      return { dryRun: true };
    }

    try {
      const result = await this.callSlackApi('canvases.edit', {
        canvas_id: canvasId,
        changes: [
          {
            operation: 'replace',
            document_content: {
              type: 'markdown',
              markdown: documentContent,
            },
          },
        ],
      });

      return {
        success: true,
      };
    } catch (error) {
      console.error('Failed to update canvas:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  buildChangelogMessage(summary, commitUrl) {
    const { added, updated, moved, deleted } = summary;
    const parts = [];

    if (added > 0) parts.push(`📄 ${added} added`);
    if (updated > 0) parts.push(`✏️ ${updated} updated`);
    if (moved > 0) parts.push(`➡️ ${moved} moved`);
    if (deleted > 0) parts.push(`🗑️ ${deleted} deleted`);

    const changeText = parts.join(' • ');
    const timestamp = new Date().toISOString().split('T')[0];

    return {
      text: `Notion Mirror Sync — ${timestamp}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Notion Mirror Sync*\n_${timestamp}_\n\n${changeText}\n\n<${commitUrl}|View changes on GitHub>`,
          },
        },
      ],
    };
  }

  buildCanvasIndex(tree, githubUrl) {
    let content = `# Notion Mirror Index\n\n`;
    content += `_Last synced: ${new Date().toISOString()}_\n\n`;

    function traverse(node, depth = 0) {
      if (!node) return '';

      const indent = '  '.repeat(depth);
      let md = '';

      if (node.type === 'page') {
        const link = `${githubUrl}/blob/main/notion-mirror${node.path}/_index.md`;
        md += `${indent}- [${node.title}](${link})\n`;
        if (node.children) {
          for (const child of node.children) {
            md += traverse(child, depth + 1);
          }
        }
      } else if (node.type === 'database') {
        const link = `${githubUrl}/blob/main/notion-mirror${node.path}/_index.md`;
        md += `${indent}- **${node.title}** (DB)\n`;
        md += `${indent}  [View in GitHub](${link})\n`;
      }

      return md;
    }

    content += traverse(tree);
    return content;
  }
}
