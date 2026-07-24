# Notion Sync Troubleshooting Guide

## Overview
This guide helps diagnose and fix issues with the Notion → GitHub → Slack sync pipeline.

## Error 1: "Invalid request URL" or Notion API Errors

### Symptoms
```
Failed to query database f7641f65622d4ab19d302849d3b1366d: Invalid request URL.
```

### Root Causes
1. Invalid or malformed Notion ID
2. Incorrect Notion API token
3. API rate limiting
4. Network connectivity issues

### Solutions

1. **Validate Notion Token**
   ```bash
   # Check if NOTION_TOKEN is set
   echo $NOTION_TOKEN
   ```

2. **Verify Page/Database ID Format**
   - Notion IDs should be 32 hex characters: `f7641f65622d4ab19d302849d3b1366d`
   - They may contain hyphens: `f7641f65-622d-4ab1-9d30-2849d3b1366d`
   - Both formats are valid

3. **Run Diagnostic**
   ```bash
   node debug.js
   ```

4. **Check API Version**
   - The code uses Notion API version `2025-09-03`
   - Ensure your token has access to this API version

## Error 2: "database, not a page" or ID Type Mismatch

### Symptoms
```
Provided ID f7641f65622d4ab19d302849d3b1366d is a database, not a page. 
Use the retrieve database API instead.
```

### Root Causes
1. A database ID was passed to the page retrieval API
2. Incorrect tree structure from Notion export
3. Child block type misidentification

### Solutions

1. **Verify Child Block Types**
   - Check that `child_database` blocks are identified correctly
   - Check that `child_page` blocks are identified correctly
   - The code now logs warnings for mismatched types

2. **Enable Verbose Logging**
   ```bash
   VERBOSE=1 node sync.js
   ```

3. **Run with Dry-Run Mode**
   ```bash
   node sync.js --dry-run
   ```
   This mode shows what would happen without making changes

## Error 3: "not a git repository"

### Symptoms
```
Git command failed: git add -A
fatal: not a git repository (or any of the parent directories): .git
```

### Root Causes
1. Incorrect repository root path calculation
2. Working directory not set properly
3. Missing `.git` directory

### Solutions

1. **Verify Git Repository**
   ```bash
   # From the repo root, this should succeed
   git rev-parse --git-dir
   ```

2. **Check Directory Paths**
   ```bash
   node -e "import('./config.js').then(({config}) => {
     console.log('Repo Root:', config.repoRoot);
     console.log('Mirror Dir:', config.mirrorDir);
   })"
   ```

3. **Set REPO_ROOT Explicitly** (if auto-detection fails)
   ```bash
   REPO_ROOT=/path/to/repo node sync.js
   ```

4. **Validate Path Resolution**
   The code now:
   - Converts all paths to absolute using `resolve()`
   - Validates git repository before attempting operations
   - Provides detailed error messages with directory paths

## Common Issues and Fixes

### Issue: "Configuration validation failed: Missing required config"

**Fix:**
```bash
export NOTION_TOKEN="your-token-here"
export SLACK_BOT_TOKEN="your-bot-token-here"
export SLACK_CHANNEL_ID="C0BFHPUUMRT"
export NOTION_ROOT_PAGE_ID="your-page-id-here"
node sync.js
```

### Issue: Partial sync or missing pages

**Fix:**
1. Run with verbose mode: `VERBOSE=1 node sync.js`
2. Check `_manifest.json` for comparison with previous state
3. Verify Notion page permissions

### Issue: Git commit fails but files are staged

**Fix:**
```bash
# Check git status
git status

# Reset and retry
git reset HEAD

# Run sync again
node sync.js
```

## Using the Debug Script

```bash
node debug.js
```

This script validates:
1. ✅ Configuration variables
2. ✅ Directory paths (absolute)
3. ✅ Git repository setup
4. ✅ Notion API connection
5. ✅ ID format validation

## Recent Improvements

### Version 1.1 Enhancements
- ✅ Better error messages with directory paths
- ✅ ID format validation before API calls
- ✅ Git repository validation at initialization
- ✅ Absolute path resolution for all directories
- ✅ Enhanced error handling in all steps
- ✅ Detailed logging during failures

## Testing Locally

### 1. Dry-run mode (no changes)
```bash
node sync.js --dry-run
```

### 2. Full sync with verbose output
```bash
VERBOSE=1 node sync.js
```

### 3. Check syntax only
```bash
npm run check
```

## Getting Help

If you encounter an issue:

1. Run `node debug.js` and share the output
2. Run with `VERBOSE=1` flag and share the logs
3. Check that all required tokens are set
4. Verify Notion page/database IDs using Notion's share link (the ID is in the URL)
5. Ensure git repository is properly initialized

## Notion ID Format

You can find your Notion IDs from:
1. **Page/Database Share Link**: `https://www.notion.so/{page-id}?v={view-id}`
   - Extract the first part before `?v=`
   - Remove hyphens: `abc123def456abc123def456abc123de` → `abc123def456abc123def456abc123de`

2. **API Response**: The ID appears in the JSON response from Notion API

## GitHub Actions Integration

The workflow file at `.github/workflows/notion-sync.yml` includes:
- Automatic scheduling (daily at midnight UTC)
- Manual trigger via `workflow_dispatch`
- Configuration validation
- Error reporting

All secrets are environment variables - ensure they're set in GitHub Actions settings.
