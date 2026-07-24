import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  // API credentials from environment
  notionToken: process.env.NOTION_TOKEN,
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID || 'C0BFHPUUMRT',

  // Notion root page to start crawling from
  // This should be the "DK 마케팅 한국팀" page ID
  // Set via env variable or default placeholder
  notionRootPageId: process.env.NOTION_ROOT_PAGE_ID || 'f13e1e9f7b55478fb85d04d38e293de7',

  // File paths
  repoRoot: process.env.REPO_ROOT || dirname(dirname(dirname(__dirname))),
  mirrorDir: join(dirname(dirname(dirname(__dirname))), 'notion-mirror'),
  manifestPath: join(dirname(dirname(dirname(__dirname))), 'notion-mirror', '_manifest.json'),

  // Slack configuration
  slack: {
    channelId: process.env.SLACK_CHANNEL_ID || 'C0BFHPUUMRT',
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  },

  // GitHub
  github: {
    repository: process.env.GITHUB_REPOSITORY,
    serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
  },

  // Sync behavior
  dryRun: process.argv.includes('--dry-run') || process.env.DRY_RUN === '1',
  verbose: process.env.VERBOSE === '1',
};

export function validateConfig() {
  const required = ['notionToken', 'slackBotToken', 'slackChannelId', 'notionRootPageId'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`);
  }

  return config;
}
