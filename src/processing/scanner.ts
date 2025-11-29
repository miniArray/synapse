/**
 * Vault scanner - detects changes in markdown files
 */

import type { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { getAllSources } from "../storage/database.js";

export type ChangeSet = {
  newFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  unchangedCount: number;
};

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Check if a path should be excluded from scanning
 * Excludes hidden files/directories and common non-vault directories
 */
function shouldExclude(name: string): boolean {
  return (
    name.startsWith(".") ||
    name === "node_modules" ||
    name === "dist" ||
    name === "__pycache__"
  );
}

/**
 * Recursively find all .md files in a directory
 * Returns absolute paths
 */
async function findMarkdownFiles(
  dir: string,
  results: string[] = [],
): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/directories
      if (shouldExclude(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await findMarkdownFiles(fullPath, results);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to scan directory ${dir}: ${message}`);
  }
}

/**
 * Get file modification time in milliseconds
 */
async function getFileMtime(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return Math.floor(stats.mtimeMs);
}

/**
 * Scan vault directory and compare with database to detect changes
 */
export async function scanVault(
  vaultPath: string,
  db: Database,
): Promise<ChangeSet> {
  // Find all markdown files in vault
  const absolutePaths = await findMarkdownFiles(vaultPath);

  // Convert to relative paths (relative to vault root)
  const diskFiles = new Map<string, number>();
  for (const absPath of absolutePaths) {
    const relPath = normalizePath(relative(vaultPath, absPath));
    const mtime = await getFileMtime(absPath);
    diskFiles.set(relPath, mtime);
  }

  // Get all sources from database
  const dbSources = getAllSources(db);
  const dbFiles = new Map<string, number>();
  for (const source of dbSources) {
    dbFiles.set(source.path, source.mtime);
  }

  // Compare and categorize
  const newFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];
  let unchangedCount = 0;

  // Check files on disk
  for (const path of Array.from(diskFiles.keys())) {
    const mtime = diskFiles.get(path)!;
    const dbMtime = dbFiles.get(path);

    if (dbMtime === undefined) {
      // File exists on disk but not in DB
      newFiles.push(path);
    } else if (dbMtime !== mtime) {
      // File exists in both but mtime differs
      modifiedFiles.push(path);
    } else {
      // File unchanged
      unchangedCount++;
    }
  }

  // Check for deleted files (in DB but not on disk)
  for (const path of Array.from(dbFiles.keys())) {
    if (!diskFiles.has(path)) {
      deletedFiles.push(path);
    }
  }

  return {
    newFiles,
    modifiedFiles,
    deletedFiles,
    unchangedCount,
  };
}
