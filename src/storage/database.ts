/**
 * SQLite database module for Synapse
 * Stores embeddings and metadata for sources and blocks
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Source entry stored in the database
 */
export type SourceEntry = {
  path: string;
  contentHash: string;
  mtime: number;
  embedding: number[];
  model: string;
  updatedAt: number;
};

/**
 * Block entry stored in the database
 */
export type BlockEntry = {
  blockKey: string;
  embedding: number[];
  lineStart: number;
  lineEnd: number;
};

/**
 * Internal database row type for sources
 */
type SourceRow = {
  path: string;
  content_hash: string;
  mtime: number;
  embedding: Buffer;
  model: string;
  updated_at: number;
};

/**
 * Internal database row type for blocks
 */
type BlockRow = {
  id: number;
  source_path: string;
  block_key: string;
  embedding: Buffer;
  line_start: number;
  line_end: number;
};

/**
 * Convert a number array to a binary buffer (Float32Array -> Buffer)
 */
export function serializeVector(vec: number[]): Buffer {
  const float32 = new Float32Array(vec);
  return Buffer.from(float32.buffer);
}

/**
 * Convert a binary buffer back to a number array (Buffer -> Float32Array -> number[])
 */
export function deserializeVector(buf: Buffer): number[] {
  const float32 = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / 4,
  );
  return Array.from(float32);
}

/**
 * Initialize the database schema
 */
function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      path TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY,
      source_path TEXT NOT NULL,
      block_key TEXT NOT NULL,
      embedding BLOB NOT NULL,
      line_start INTEGER,
      line_end INTEGER,
      UNIQUE(source_path, block_key),
      FOREIGN KEY(source_path) REFERENCES sources(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sources_mtime ON sources(mtime);
    CREATE INDEX IF NOT EXISTS idx_blocks_source ON blocks(source_path);
  `);
}

/**
 * Open or create a SQLite database
 */
export function openDatabase(dbPath: string): Database {
  // Ensure directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  initSchema(db);
  return db;
}

/**
 * Save a source entry to the database
 */
export function saveSource(db: Database, entry: SourceEntry): void {
  const stmt = db.prepare(`
    INSERT INTO sources (path, content_hash, mtime, embedding, model, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      content_hash = excluded.content_hash,
      mtime = excluded.mtime,
      embedding = excluded.embedding,
      model = excluded.model,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    entry.path,
    entry.contentHash,
    entry.mtime,
    serializeVector(entry.embedding),
    entry.model,
    entry.updatedAt,
  );
}

/**
 * Get a source entry from the database
 */
export function getSource(db: Database, path: string): SourceEntry | null {
  const stmt = db.prepare<SourceRow, string>(
    "SELECT * FROM sources WHERE path = ?",
  );
  const row = stmt.get(path);

  if (!row) {
    return null;
  }

  return {
    path: row.path,
    contentHash: row.content_hash,
    mtime: row.mtime,
    embedding: deserializeVector(row.embedding),
    model: row.model,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all source entries from the database
 */
export function getAllSources(db: Database): SourceEntry[] {
  const stmt = db.prepare<SourceRow, []>("SELECT * FROM sources");
  const rows = stmt.all();

  return rows.map(
    (row: SourceRow): SourceEntry => ({
      path: row.path,
      contentHash: row.content_hash,
      mtime: row.mtime,
      embedding: deserializeVector(row.embedding),
      model: row.model,
      updatedAt: row.updated_at,
    }),
  );
}

/**
 * Delete a source and its blocks from the database
 */
export function deleteSource(db: Database, path: string): void {
  const stmt = db.prepare("DELETE FROM sources WHERE path = ?");
  stmt.run(path);
}

/**
 * Get the count of sources in the database
 */
export function getSourceCount(db: Database): number {
  const stmt = db.prepare<{ count: number }, []>(
    "SELECT COUNT(*) as count FROM sources",
  );
  const row = stmt.get();
  return row?.count ?? 0;
}

/**
 * Save multiple blocks for a source (replaces existing blocks)
 */
export function saveBlocks(
  db: Database,
  sourcePath: string,
  blocks: BlockEntry[],
): void {
  // Use a transaction for atomic updates
  const deleteStmt = db.prepare("DELETE FROM blocks WHERE source_path = ?");
  const insertStmt = db.prepare(`
    INSERT INTO blocks (source_path, block_key, embedding, line_start, line_end)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(
    (path: string, blockEntries: BlockEntry[]) => {
      // Delete existing blocks for this source
      deleteStmt.run(path);

      // Insert new blocks
      for (const block of blockEntries) {
        insertStmt.run(
          path,
          block.blockKey,
          serializeVector(block.embedding),
          block.lineStart,
          block.lineEnd,
        );
      }
    },
  );

  transaction(sourcePath, blocks);
}

/**
 * Get all blocks for a source
 */
export function getBlocks(db: Database, sourcePath: string): BlockEntry[] {
  const stmt = db.prepare<BlockRow, string>(
    "SELECT * FROM blocks WHERE source_path = ? ORDER BY line_start",
  );
  const rows = stmt.all(sourcePath);

  return rows.map(
    (row: BlockRow): BlockEntry => ({
      blockKey: row.block_key,
      embedding: deserializeVector(row.embedding),
      lineStart: row.line_start,
      lineEnd: row.line_end,
    }),
  );
}
