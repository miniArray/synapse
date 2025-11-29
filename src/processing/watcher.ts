/**
 * File watcher module for Synapse
 * Watches vault directory for file changes and triggers incremental embedding
 */

import type { Database } from "bun:sqlite";
import { type FSWatcher, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type BlockEntry,
  deleteSource,
  type SourceEntry,
  saveBlocks,
  saveSource,
} from "../storage/database.js";
import { parseMarkdown } from "./parser.js";

export type WatcherConfig = {
  ollamaUrl: string;
  model: string;
  debounceMs?: number; // default 500
};

export type WatchEvent = {
  type: "add" | "change" | "delete";
  path: string;
};

export type Watcher = {
  stop(): void;
};

/**
 * Generate embeddings for text chunks using Ollama
 */
async function generateEmbeddings(
  texts: string[],
  ollamaUrl: string,
  model: string,
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const response = await fetch(`${ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { embeddings?: number[][] };
    const embedding = data.embeddings?.[0];

    if (!embedding) {
      throw new Error("No embedding returned from Ollama");
    }

    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Process a single file: parse, embed, and save to database
 */
async function processFile(
  filePath: string,
  absolutePath: string,
  db: Database,
  config: WatcherConfig,
): Promise<void> {
  try {
    // Read file content
    const content = await readFile(absolutePath, "utf-8");

    // Parse markdown
    const parsed = parseMarkdown(content);

    // Skip empty files
    if (!parsed.fullText.trim()) {
      return;
    }

    // Get file mtime
    const stats = await stat(absolutePath);
    const mtime = Math.floor(stats.mtimeMs);

    // Prepare texts for embedding (full text + all blocks)
    const texts = [parsed.fullText, ...parsed.blocks.map((b) => b.text)];

    // Generate embeddings
    const embeddings = await generateEmbeddings(
      texts,
      config.ollamaUrl,
      config.model,
    );

    // Save source with full text embedding
    const sourceEntry: SourceEntry = {
      path: filePath,
      contentHash: parsed.contentHash,
      mtime,
      embedding: embeddings[0],
      model: config.model,
      updatedAt: Date.now(),
    };

    saveSource(db, sourceEntry);

    // Save blocks with their embeddings
    const blockEntries: BlockEntry[] = parsed.blocks.map((block, index) => ({
      blockKey: block.key,
      embedding: embeddings[index + 1], // +1 because embeddings[0] is full text
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
    }));

    saveBlocks(db, filePath, blockEntries);
  } catch (error) {
    console.error(`Failed to process ${filePath}:`, error);
    throw error;
  }
}

/**
 * Start watching a vault directory for file changes
 */
export function startWatcher(
  vaultPath: string,
  db: Database,
  config: WatcherConfig,
  onUpdate?: (event: WatchEvent) => void,
): Watcher {
  const debounceMs = config.debounceMs ?? 500;
  const pending = new Set<string>();
  let timer: Timer | null = null;

  /**
   * Process all pending files after debounce period
   */
  async function processFiles(): Promise<void> {
    const files = [...pending];
    pending.clear();

    for (const filePath of files) {
      const absolutePath = join(vaultPath, filePath);

      try {
        // Check if file exists
        try {
          await stat(absolutePath);

          // File exists - process it
          await processFile(filePath, absolutePath, db, config);

          // Notify callback
          if (onUpdate) {
            onUpdate({ type: "change", path: filePath });
          }
        } catch (statError) {
          // File doesn't exist - it was deleted
          deleteSource(db, filePath);

          // Notify callback
          if (onUpdate) {
            onUpdate({ type: "delete", path: filePath });
          }
        }
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }
  }

  /**
   * Schedule processing after debounce period
   */
  function scheduleProcess(): void {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void processFiles();
    }, debounceMs);
  }

  /**
   * Handle file change event
   */
  function handleChange(_eventType: string, filename: string | null): void {
    if (!filename) {
      return;
    }

    // Only watch markdown files
    if (!filename.endsWith(".md")) {
      return;
    }

    // Add to pending set
    pending.add(filename);

    // Schedule processing
    scheduleProcess();
  }

  // Start watching
  const fsWatcher: FSWatcher = watch(
    vaultPath,
    { recursive: true },
    handleChange,
  );

  // Handle watcher errors gracefully (e.g., permission denied on some files)
  fsWatcher.on("error", (error) => {
    // Log but don't crash on permission errors
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      console.error("[Watcher] Permission denied (ignored):", error.message);
    } else {
      console.error("[Watcher] Error:", error);
    }
  });

  // Return watcher control object
  return {
    stop(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fsWatcher.close();
      pending.clear();
    },
  };
}
