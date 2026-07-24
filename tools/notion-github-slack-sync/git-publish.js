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
    if (this.dryRun) {
      console.log('📝 [DRY-RUN] 변경사항이 있으면 커밋할 예정\n');
      return {
        changed: false,
        dryRun: true,
        reason: 'Dry-run mode enabled',
      };
    }

    // Stage all changes
    try {
      this.exec('git add -A');
      console.log('📦 변경사항 스테이징 완료');
    } catch (error) {
      console.error('❌ 스테이징 실패:', error.message);
      return {
        changed: false,
        error: error.message,
      };
    }

    // Check if there are staged changes
    const statusOutput = this.exec('git status --porcelain');

    if (!statusOutput) {
      console.log('ℹ️  변경사항 없음 - 커밋 스킵');
      return {
        changed: false,
        reason: 'No changes to commit',
      };
    }

    console.log('📋 스테이징된 변경사항:\n' + statusOutput);

    // Create commit message
    const { filesWritten = 0, filesDeleted = 0 } = summary;
    const parts = [];
    if (filesWritten > 0) parts.push(`+${filesWritten} files`);
    if (filesDeleted > 0) parts.push(`-${filesDeleted} files`);

    const message = parts.length > 0
      ? `chore: notion mirror sync — ${parts.join(', ')}`
      : 'chore: notion mirror sync';

    try {
      this.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
      console.log(`✅ 커밋 완료: ${message}`);
    } catch (error) {
      console.error('❌ 커밋 실패:', error.message);
      return {
        changed: false,
        error: error.message,
      };
    }

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
