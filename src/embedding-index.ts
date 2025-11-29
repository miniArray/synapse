/**
 * SQLite embedding index - loads and indexes embeddings from database
 */

import { join } from "node:path";
import { getAllSources, getBlocks, openDatabase } from "./storage/database.js";
import type { EmbeddingIndex } from "./types.js";

// Module state
let index: EmbeddingIndex | null = null;

/**
 * Load all embeddings from SQLite database and build in-memory index
 */
export async function loadEmbeddingIndex(
  envPath: string,
): Promise<EmbeddingIndex> {
  if (index) {
    return index;
  }

  const dbPath = join(envPath, "embeddings.db");
  const sources = new Map<
    string,
    { path: string; vec: ReadonlyArray<number>; blocks: ReadonlyArray<string> }
  >();
  const blocks = new Map<
    string,
    { key: string; vec: ReadonlyArray<number>; sourcePath: string }
  >();

  console.error(`[Index] Loading embeddings from: ${dbPath}`);

  try {
    const db = openDatabase(dbPath);

    // Load all sources
    const allSources = getAllSources(db);
    for (const source of allSources) {
      const sourceBlocks = getBlocks(db, source.path);
      sources.set(source.path, {
        path: source.path,
        vec: source.embedding,
        blocks: sourceBlocks.map((b) => b.blockKey),
      });

      // Load blocks
      for (const block of sourceBlocks) {
        const blockKey = `${source.path}#${block.blockKey}`;
        blocks.set(blockKey, {
          key: blockKey,
          vec: block.embedding,
          sourcePath: source.path,
        });
      }
    }

    console.error(
      `[Index] Loaded ${sources.size} sources and ${blocks.size} blocks from SQLite`,
    );

    index = { sources, blocks };
    db.close();
    return index;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to load embedding index: ${message}`);
  }
}

/**
 * Get the current embedding index (throws if not loaded)
 */
export function getIndex(): EmbeddingIndex {
  if (!index) {
    throw new Error(
      "Embedding index not loaded. Call loadEmbeddingIndex first.",
    );
  }
  return index;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal !== undefined && bVal !== undefined) {
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Find nearest sources to a query vector
 */
export function findNearestSources(
  queryVec: ReadonlyArray<number>,
  limit: number,
  threshold: number,
  excludePath?: string,
): ReadonlyArray<{
  path: string;
  similarity: number;
  blocks: ReadonlyArray<string>;
}> {
  const idx = getIndex();
  const results: Array<{
    path: string;
    similarity: number;
    blocks: ReadonlyArray<string>;
  }> = [];

  for (const [path, source] of idx.sources) {
    if (excludePath && path === excludePath) continue;

    const similarity = cosineSimilarity(queryVec, source.vec);
    if (similarity >= threshold) {
      results.push({ path, similarity, blocks: source.blocks });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, limit);
}

/**
 * Get embedding vector for a source path
 */
export function getSourceVector(path: string): ReadonlyArray<number> | null {
  const idx = getIndex();
  const source = idx.sources.get(path);
  return source?.vec ?? null;
}

/**
 * Check if index is loaded
 */
export function isIndexLoaded(): boolean {
  return index !== null;
}
