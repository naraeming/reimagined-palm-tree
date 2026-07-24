/**
 * Debug script to diagnose Notion API and configuration issues
 * Usage: node debug.js
 */

import { config, validateConfig } from './config.js';
import { NotionExporter } from './notion-export.js';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

console.log('\n🔍 Diagnostic Check Starting...\n');

// 1. Configuration validation
console.log('1️⃣ Configuration Validation:');
try {
  validateConfig();
  console.log('   ✅ Configuration is valid');
  console.log(`   - Notion Token: ${config.notionToken ? 'Set' : 'MISSING'}`);
  console.log(`   - Slack Bot Token: ${config.slackBotToken ? 'Set' : 'MISSING'}`);
  console.log(`   - Slack Channel: ${config.slackChannelId}`);
  console.log(`   - Notion Root Page ID: ${config.notionRootPageId}`);
} catch (error) {
  console.error('   ❌ Configuration validation failed:');
  console.error(`   ${error.message}`);
  process.exit(1);
}

// 2. Directory validation
console.log('\n2️⃣ Directory Validation:');
console.log(`   - Repo Root (absolute): ${resolve(config.repoRoot)}`);
console.log(`   - Mirror Dir (absolute): ${resolve(config.mirrorDir)}`);
console.log(`   - Manifest Path (absolute): ${resolve(config.manifestPath)}`);

// 3. Git repository validation
console.log('\n3️⃣ Git Repository Validation:');
try {
  const gitDir = execSync('git rev-parse --git-dir', {
    cwd: config.repoRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
  console.log(`   ✅ Git repository found`);
  console.log(`   - Git dir: ${gitDir}`);

  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: config.repoRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
  console.log(`   - Current branch: ${currentBranch}`);
} catch (error) {
  console.error('   ❌ Git repository error:');
  console.error(`   ${error.message}`);
}

// 4. Notion API validation
console.log('\n4️⃣ Notion API Validation:');
try {
  const exporter = new NotionExporter(config.notionToken);
  console.log('   ✅ Notion client initialized');

  // Validate the root page ID format
  const rootPageId = config.notionRootPageId;
  const cleanId = rootPageId.replace(/-/g, '');
  if (!/^[a-f0-9]{32}$/i.test(cleanId)) {
    console.warn(`   ⚠️  Root page ID has unusual format: ${rootPageId}`);
  } else {
    console.log(`   ✅ Root page ID format is valid: ${rootPageId}`);
  }
} catch (error) {
  console.error('   ❌ Notion client initialization failed:');
  console.error(`   ${error.message}`);
  process.exit(1);
}

console.log('\n✨ Diagnostics complete!\n');
console.log('💡 Tips:');
console.log('   - If "Notion API" validation fails, check your NOTION_TOKEN');
console.log('   - If "Git Repository" validation fails, ensure .git exists in repo root');
console.log('   - If paths look wrong, check REPO_ROOT environment variable');
console.log('\n');
