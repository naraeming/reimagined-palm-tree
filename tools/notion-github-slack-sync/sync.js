import { promises as fs } from 'node:fs';
import { config, validateConfig } from './config.js';
import { NotionExporter } from './notion-export.js';
import { createManifest, diffManifests, summarizeDiff } from './manifest.js';
import { FileSystemPublisher } from './fs-publish.js';
import { GitPublisher } from './git-publish.js';
import { SlackNotifier } from './slack-notify.js';

async function loadManifest(manifestPath) {
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function saveManifest(manifestPath, manifest) {
  const dir = manifestPath.split('/').slice(0, -1).join('/');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

async function main() {
  try {
    console.log('🚀 Notion → GitHub → Slack Sync Starting...\n');

    // Validate configuration
    validateConfig();
    console.log(`✅ Configuration loaded`);
    console.log(`   Notion Root Page ID: ${config.notionRootPageId}`);
    console.log(`   Slack Channel: ${config.slackChannelId}`);
    console.log(`   Dry Run: ${config.dryRun}\n`);

    // Step 1: Export from Notion
    console.log('📡 Step 1: Exporting from Notion...');
    const exporter = new NotionExporter(config.notionToken);
    const tree = await exporter.exportWorkspace(config.notionRootPageId);
    if (!tree) {
      throw new Error('Failed to export Notion workspace');
    }
    console.log(`✅ Exported: ${tree.title}`);
    console.log(`   Found ${exporter.visited.size} pages/databases\n`);

    // Step 2: Create new manifest
    console.log('📋 Step 2: Computing manifest diff...');
    const newManifest = createManifest(tree);
    const oldManifest = await loadManifest(config.manifestPath);

    let diff;
    let summary;
    if (!oldManifest) {
      console.log('   First run: will create all files');
      // Mark all as new
      diff = {
        toWrite: Object.entries(newManifest.entries).map(([id, entry]) => ({
          id,
          entry,
          type: 'add',
        })),
        toDelete: [],
        toMove: [],
        unchanged: [],
      };
    } else {
      diff = diffManifests(oldManifest, newManifest);
    }

    summary = summarizeDiff(diff);
    console.log(`✅ Changes detected:`);
    console.log(`   Added: ${summary.added}, Updated: ${summary.updated}, Moved: ${summary.moved}, Deleted: ${summary.deleted}\n`);

    // If no changes, skip everything else
    if (summary.total === 0) {
      console.log('✨ No changes detected. Exiting silently.');
      process.exit(0);
    }

    // Step 3: Publish to filesystem
    console.log('💾 Step 3: Publishing to filesystem...');
    const fsPublisher = new FileSystemPublisher(config.mirrorDir);
    const fsSummary = await fsPublisher.publish(tree, diff);
    console.log(`✅ Files published:`);
    console.log(`   Written: ${fsSummary.filesWritten}, Deleted: ${fsSummary.filesDeleted}`);
    if (fsSummary.errors.length > 0) {
      console.warn(`   Errors: ${fsSummary.errors.join('; ')}`);
    }
    console.log();

    // Step 4: Commit to git
    console.log('🔗 Step 4: Committing to git...');
    const gitPublisher = new GitPublisher(config.repoRoot, config.dryRun);
    const commitResult = await gitPublisher.checkAndCommit(summary);
    if (commitResult.changed) {
      console.log(`✅ ${commitResult.message}`);
      if (commitResult.commitSha) {
        console.log(`   Commit: ${commitResult.commitSha}`);
        console.log(`   URL: ${commitResult.commitUrl}`);
      }
    } else {
      console.log(`ℹ️ ${commitResult.reason}`);
    }
    console.log();

    // Step 5: Push to GitHub
    if (commitResult.changed && !config.dryRun) {
      console.log('⬆️ Step 5: Pushing to GitHub...');
      const pushResult = await gitPublisher.push();
      if (pushResult.success) {
        console.log('✅ Pushed successfully\n');
      } else {
        console.warn(`⚠️ Push failed: ${pushResult.error}\n`);
      }
    }

    // Step 6: Notify Slack
    console.log('💬 Step 6: Notifying Slack...');
    const slackNotifier = new SlackNotifier(config.slackBotToken, config.slackChannelId, config.dryRun);

    // Post changelog message
    const changelogMessage = slackNotifier.buildChangelogMessage(
      summary,
      commitResult.commitUrl || 'https://github.com'
    );
    await slackNotifier.postMessage(changelogMessage.text, changelogMessage.blocks);
    console.log('✅ Posted changelog message');

    // Create or update canvas
    const canvasContent = slackNotifier.buildCanvasIndex(
      tree,
      `${config.github.serverUrl}/${config.github.repository}`
    );

    let canvasId = newManifest.slackCanvasId;
    if (!canvasId) {
      console.log('   Creating new canvas index...');
      const canvasResult = await slackNotifier.createCanvas('Notion Mirror Index', canvasContent);
      if (canvasResult.success) {
        canvasId = canvasResult.canvasId;
        newManifest.slackCanvasId = canvasId;
        console.log(`✅ Created canvas: ${canvasId}`);
      }
    } else {
      console.log('   Updating canvas index...');
      await slackNotifier.updateCanvas(canvasId, canvasContent);
      console.log('✅ Updated canvas');
    }
    console.log();

    // Save updated manifest
    await saveManifest(config.manifestPath, newManifest);
    console.log('✅ Manifest saved\n');

    console.log('🎉 Sync completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    if (config.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
