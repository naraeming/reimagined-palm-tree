import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';

export class GitPublisher {
  constructor(repoRoot, dryRun = false) {
    this.repoRoot = repoRoot;
    this.dryRun = dryRun;
  }

  exec(command, options = {}) {
    const opts = {
      cwd: this.repoRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
      ...options,
    };

    try {
      return execSync(command, opts).trim();
    } catch (error) {
      throw new Error(`Git command failed: ${command}\n${error.stderr || error.message}`);
    }
  }

  async checkAndCommit(summary) {
    // Check if there are any changes
    const status = this.exec('git status --porcelain notion-mirror/');

    if (!status) {
      return {
        changed: false,
        reason: 'No changes detected',
      };
    }

    if (this.dryRun) {
      return {
        changed: true,
        dryRun: true,
        reason: 'Would commit (dry-run mode)',
        changes: status,
      };
    }

    // Stage all changes in notion-mirror/
    this.exec('git add -A notion-mirror/ _manifest.json', { stdio: 'inherit' });

    // Create commit message
    const { added, updated, moved, deleted } = summary;
    const parts = [];
    if (added > 0) parts.push(`+${added} added`);
    if (updated > 0) parts.push(`~${updated} updated`);
    if (moved > 0) parts.push(`→${moved} moved`);
    if (deleted > 0) parts.push(`-${deleted} deleted`);

    const message = `chore: notion mirror sync — ${parts.join(', ')}`;

    this.exec(`git commit -m "${message}"`, { stdio: 'inherit' });

    // Get commit info
    const sha = this.exec('git rev-parse HEAD');
    const commitUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/commit/${sha}`;

    return {
      changed: true,
      commitSha: sha,
      commitUrl,
      message,
    };
  }

  async push() {
    if (this.dryRun) {
      return {
        dryRun: true,
        reason: 'Would push (dry-run mode)',
      };
    }

    try {
      this.exec('git push origin main', { stdio: 'inherit' });
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
