/**
 * Embedding pipeline - orchestrates vault scanning, parsing, embedding, and storage
 */

import type { Database } from "bun:sqlite";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { generateEmbeddings } from "../embed-model.js";
import {
  type BlockEntry,
  deleteSource,
  type SourceEntry,
  saveBlocks,
  saveSource,
} from "../storage/database.js";
import { parseMarkdown } from "./parser.js";
import { scanVault } from "./scanner.js";

export type PipelineConfig = {
  ollamaUrl: string;
  model: string;
  batchSize?: number;
};

export type PipelineStats = {
  processed: number;
  failed: number;
  deleted: number;
  skipped: number;
  duration: number;
};

type PendingFile = {
  path: string;
  fullText: string;
  contentHash: string;
  mtime: number;
  blocks: Array<{
    key: string;
    text: string;
    lineStart: number;
    lineEnd: number;
  }>;
};

/**
 * Run the embedding pipeline
 */
export async function runPipeline(
  vaultPath: string,
  db: Database,
  config: PipelineConfig,
  onProgress?: (current: number, total: number, file: string) => void,
): Promise<PipelineStats> {
  const startTime = Date.now();
  const batchSize = config.batchSize ?? 32;

  const stats: PipelineStats = {
    processed: 0,
    failed: 0,
    deleted: 0,
    skipped: 0,
    duration: 0,
  };

  // Step 1: Scan vault for changes
  console.error("[Pipeline] Scanning vault...");
  const changeset = await scanVault(vaultPath, db);
  console.error(
    `[Pipeline] Found ${changeset.newFiles.length} new, ${changeset.modifiedFiles.length} modified, ${changeset.deletedFiles.length} deleted`,
  );

  // Step 2: Delete removed files from DB
  for (const filePath of changeset.deletedFiles) {
    deleteSource(db, filePath);
    stats.deleted++;
  }

  // Step 3: Process new and modified files
  const filesToProcess = [...changeset.newFiles, ...changeset.modifiedFiles];
  const totalFiles = filesToProcess.length;

  if (totalFiles === 0) {
    console.error("[Pipeline] No files to process");
    stats.duration = Date.now() - startTime;
    return stats;
  }

  // Batch state
  let pendingFiles: PendingFile[] = [];
  let pendingTexts: string[] = [];

  const processBatch = async () => {
    if (pendingFiles.length === 0) return;

    try {
      // Generate embeddings for all texts
      const embeddings = await generateEmbeddings(
        pendingTexts,
        config.model,
        config.ollamaUrl,
      );

      // Map embeddings back to files
      let embeddingIdx = 0;
      for (const file of pendingFiles) {
        try {
          // First embedding is full text
          const sourceEmbedding = embeddings[embeddingIdx] as number[];
          embeddingIdx++;

          // Save source
          const sourceEntry: SourceEntry = {
            path: file.path,
            contentHash: file.contentHash,
            mtime: file.mtime,
            embedding: sourceEmbedding,
            model: config.model,
            updatedAt: Date.now(),
          };
          saveSource(db, sourceEntry);

          // Save blocks
          const blockEntries: BlockEntry[] = file.blocks.map((block) => {
            const blockEmbedding = embeddings[embeddingIdx] as number[];
            embeddingIdx++;
            return {
              blockKey: block.key,
              embedding: blockEmbedding,
              lineStart: block.lineStart,
              lineEnd: block.lineEnd,
            };
          });

          if (blockEntries.length > 0) {
            saveBlocks(db, file.path, blockEntries);
          }

          stats.processed++;
        } catch (error) {
          console.error(`[Pipeline] Failed to save ${file.path}:`, error);
          stats.failed++;
        }
      }
    } catch (error) {
      console.error("[Pipeline] Batch embedding failed:", error);
      stats.failed += pendingFiles.length;
    }

    // Clear batch
    pendingFiles = [];
    pendingTexts = [];
  };

  // Process each file
  for (let i = 0; i < filesToProcess.length; i++) {
    const filePath = filesToProcess[i];

    if (onProgress) {
      onProgress(i + 1, totalFiles, filePath);
    }

    try {
      // Read and parse file
      const absolutePath = join(vaultPath, filePath);
      const content = await readFile(absolutePath, "utf-8");
      const fileStat = await stat(absolutePath);
      const parsed = parseMarkdown(content);

      // Skip empty files
      if (!parsed.fullText.trim()) {
        stats.skipped++;
        continue;
      }

      // Collect texts (full text + all block texts)
      const textsForFile = [
        parsed.fullText,
        ...parsed.blocks.map((b) => b.text),
      ];

      // Check if batch would overflow
      if (
        pendingTexts.length + textsForFile.length > batchSize &&
        pendingTexts.length > 0
      ) {
        await processBatch();
      }

      // Add to batch
      pendingFiles.push({
        path: filePath,
        fullText: parsed.fullText,
        contentHash: parsed.contentHash,
        mtime: Math.floor(fileStat.mtimeMs),
        blocks: parsed.blocks,
      });
      pendingTexts.push(...textsForFile);

      // Process if batch is full
      if (pendingTexts.length >= batchSize) {
        await processBatch();
      }
    } catch (error) {
      console.error(`[Pipeline] Failed to process ${filePath}:`, error);
      stats.failed++;
    }
  }

  // Process remaining batch
  await processBatch();

  stats.duration = Date.now() - startTime;
  return stats;
}
