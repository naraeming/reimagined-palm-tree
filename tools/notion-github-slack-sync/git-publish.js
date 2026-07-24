import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

export class GitPublisher {
  constructor(repoRoot, dryRun = false) {
    // Convert to absolute path to ensure correct directory
    this.repoRoot = resolve(repoRoot);
    this.dryRun = dryRun;

    // Validate that this is a git repository
    this.validateGitRepo();
  }

  validateGitRepo() {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.repoRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (error) {
      throw new Error(`Invalid git repository at ${this.repoRoot}: ${error.message}`);
    }
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
      throw new Error(`Git command failed in ${this.repoRoot}: ${command}\n${error.stderr || error.message}`);
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
      console.log(`   Running: git add -A`);
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
    let statusOutput;
    try {
      statusOutput = this.exec('git status --porcelain');
    } catch (error) {
      console.error('❌ Git 상태 확인 실패:', error.message);
      return {
        changed: false,
        error: error.message,
      };
    }

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
      console.log(`   Running: git commit -m "${message}"`);
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
    let sha;
    try {
      sha = this.exec('git rev-parse HEAD');
    } catch (error) {
      console.error('❌ Commit SHA 조회 실패:', error.message);
      return {
        changed: true,
        message,
        error: `Failed to get commit SHA: ${error.message}`,
      };
    }

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
