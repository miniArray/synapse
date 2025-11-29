/**
 * AJSON embedding index - loads and indexes Smart Connections embeddings
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AjsonEntry,
  EmbeddingIndex,
  SmartBlockData,
  SmartSourceData,
} from "./types.js";

// Module state
let index: EmbeddingIndex | null = null;
let modelKey: string | null = null;

/**
 * Parse AJSON file format
 * Format: "key": {...},"key2": {...},... with newlines between some entries
 *
 * The format is tricky - entries can span lines or be on the same line.
 * We split on the pattern },"smart_ to separate entries.
 */
function parseAjsonFile(
  content: string,
): Array<{ key: string; entry: AjsonEntry }> {
  const results: Array<{ key: string; entry: AjsonEntry }> = [];

  // Split content into individual entries
  // Each entry starts with "smart_sources:" or "smart_blocks:"
  // Split on },"smart_ but keep the "smart_ part
  const parts = content.split(/\},\s*"smart_/);

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (!part) continue;

    // First part might have leading content, rest need "smart_ prefix restored
    if (i > 0) {
      part = '"smart_' + part;
    }

    // Remove leading empty line or $
    if (part.startsWith("\n") || part.startsWith("$")) {
      part = part.replace(/^[\n$\s]+/, "");
    }

    // Add back the closing } that we split on (except for the last part)
    if (i < parts.length - 1) {
      part = part + "}";
    } else {
      // Last part - remove trailing comma/whitespace
      part = part.replace(/[,\s$]+$/, "");
      if (!part.endsWith("}")) continue;
    }

    // Match pattern: "key": { ... }
    const keyMatch = part.match(/^"([^"]+)":\s*/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const jsonStr = part.slice(keyMatch[0].length);

    // Verify it looks like JSON object
    if (!jsonStr.startsWith("{") || !jsonStr.endsWith("}")) continue;

    try {
      const entry = JSON.parse(jsonStr) as AjsonEntry;
      results.push({ key, entry });
    } catch {
      // Skip malformed entries
    }
  }

  return results;
}

/**
 * Check if entry is a SmartSource
 */
function isSmartSource(entry: AjsonEntry): entry is SmartSourceData {
  return entry.class_name === "SmartSource";
}

/**
 * Check if entry is a SmartBlock
 */
function isSmartBlock(entry: AjsonEntry): entry is SmartBlockData {
  return entry.class_name === "SmartBlock";
}

/**
 * Extract source path from a block key (e.g., "CLAUDE.md#Section" -> "CLAUDE.md")
 */
function extractSourcePath(blockKey: string): string {
  const hashIndex = blockKey.indexOf("#");
  return hashIndex > 0 ? blockKey.slice(0, hashIndex) : blockKey;
}

/**
 * Load all AJSON files from the multi directory and build index
 */
export async function loadEmbeddingIndex(
  envPath: string,
): Promise<EmbeddingIndex> {
  if (index) {
    return index;
  }

  const multiDir = join(envPath, "multi");
  const sources = new Map<
    string,
    { path: string; vec: ReadonlyArray<number>; blocks: ReadonlyArray<string> }
  >();
  const blocks = new Map<
    string,
    { key: string; vec: ReadonlyArray<number>; sourcePath: string }
  >();

  console.error(`[Index] Loading embeddings from: ${multiDir}`);

  try {
    const files = await readdir(multiDir);
    const ajsonFiles = files.filter((f) => f.endsWith(".ajson"));

    console.error(`[Index] Found ${ajsonFiles.length} AJSON files`);

    for (const file of ajsonFiles) {
      const filePath = join(multiDir, file);
      const content = await readFile(filePath, "utf-8");
      const entries = parseAjsonFile(content);

      for (const { entry } of entries) {
        // Skip entries without embeddings
        if (!entry.embeddings || typeof entry.embeddings !== "object") continue;

        // Get the embedding vector
        const embeddingKeys = Object.keys(entry.embeddings);
        if (embeddingKeys.length === 0) continue;

        // Use first embedding model key found
        if (!modelKey) {
          modelKey = embeddingKeys[0];
          console.error(`[Index] Using embedding model: ${modelKey}`);
        }

        const embedding = entry.embeddings[modelKey];
        if (!embedding?.vec) continue;

        if (isSmartSource(entry)) {
          const blockKeys = entry.blocks ? Object.keys(entry.blocks) : [];
          sources.set(entry.path, {
            path: entry.path,
            vec: embedding.vec,
            blocks: blockKeys,
          });
        } else if (isSmartBlock(entry)) {
          const sourcePath = extractSourcePath(entry.key);
          blocks.set(entry.key, {
            key: entry.key,
            vec: embedding.vec,
            sourcePath,
          });
        }
      }
    }

    console.error(
      `[Index] Indexed ${sources.size} sources and ${blocks.size} blocks`,
    );

    index = { sources, blocks };
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
 * Get the embedding model key being used
 */
export function getModelKey(): string {
  if (!modelKey) {
    throw new Error("Model key not available. Load the index first.");
  }
  return modelKey;
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
