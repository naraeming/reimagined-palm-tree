import { createHash } from 'node:crypto';

export function createManifest(tree, timestamp = new Date().toISOString()) {
  const entries = {};
  const timestamp_generated = timestamp;

  function traverse(node) {
    if (!node) return;

    entries[node.id] = {
      type: node.type,
      path: node.path,
      title: node.title,
      lastEditedTime: node.lastEdited,
      contentHash: node.contentHash,
    };

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(tree);

  return {
    generatedAt: timestamp_generated,
    entries,
  };
}

export function diffManifests(oldManifest, newManifest) {
  const oldEntries = oldManifest?.entries || {};
  const newEntries = newManifest.entries;

  const toWrite = [];
  const toDelete = [];
  const toMove = [];
  const unchanged = [];

  // Find changes and additions
  for (const [id, newEntry] of Object.entries(newEntries)) {
    const oldEntry = oldEntries[id];

    if (!oldEntry) {
      // New entry
      toWrite.push({ id, entry: newEntry, type: 'add' });
    } else if (oldEntry.path !== newEntry.path) {
      // Moved/renamed
      toMove.push({ id, from: oldEntry.path, to: newEntry.path });
      toWrite.push({ id, entry: newEntry, type: 'move' });
    } else if (oldEntry.contentHash !== newEntry.contentHash) {
      // Content changed
      toWrite.push({ id, entry: newEntry, type: 'update' });
    } else {
      // No change
      unchanged.push(id);
    }
  }

  // Find deletions
  for (const [id, oldEntry] of Object.entries(oldEntries)) {
    if (!newEntries[id]) {
      toDelete.push({ id, path: oldEntry.path });
    }
  }

  return {
    toWrite,
    toDelete,
    toMove,
    unchanged,
  };
}

export function summarizeDiff(diff) {
  const summary = {
    added: diff.toWrite.filter((w) => w.type === 'add').length,
    updated: diff.toWrite.filter((w) => w.type === 'update').length,
    moved: diff.toMove.length,
    deleted: diff.toDelete.length,
  };

  summary.total = summary.added + summary.updated + summary.moved + summary.deleted;
  return summary;
}
