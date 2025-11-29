/**
 * Environment configuration and initialization
 */

import { join } from "node:path";
import { isIndexLoaded, loadEmbeddingIndex } from "./embedding-index.js";
import { runPipeline } from "./processing/pipeline.js";
import { startWatcher, type Watcher } from "./processing/watcher.js";
import { getSourceCount, openDatabase } from "./storage/database.js";

// Configuration state
let envPath: string | null = null;
let vaultPath: string | null = null;
let watcher: Watcher | null = null;

export type EnvironmentConfig = {
  vault_path: string;
  env_path: string;
  ollama_url?: string;
  ollama_model?: string;
};

/**
 * Initialize the environment by loading the embedding index
 */
export async function initializeEnvironment(
  config: EnvironmentConfig,
): Promise<void> {
  vaultPath = config.vault_path;
  envPath = config.env_path;

  const ollamaUrl =
    config.ollama_url ?? process.env["OLLAMA_URL"] ?? "http://localhost:11434";
  const ollamaModel =
    config.ollama_model ?? process.env["OLLAMA_MODEL"] ?? "nomic-embed-text";

  console.error(`[Environment] Vault path: ${vaultPath}`);
  console.error(`[Environment] Env path: ${envPath}`);
  console.error(`[Environment] Ollama: ${ollamaUrl} (${ollamaModel})`);

  // Open database
  const dbPath = join(envPath, "embeddings.db");
  const db = openDatabase(dbPath);

  // Check if embeddings exist
  const count = getSourceCount(db);
  if (count === 0) {
    console.error(
      "[Environment] No embeddings found, running initial pipeline...",
    );
    const stats = await runPipeline(
      vaultPath,
      db,
      {
        ollamaUrl,
        model: ollamaModel,
      },
      (current, total, file) => {
        console.error(`[Pipeline] ${current}/${total}: ${file}`);
      },
    );
    console.error(
      `[Environment] Pipeline complete: ${stats.processed} processed, ${stats.failed} failed`,
    );
  } else {
    console.error(`[Environment] Found ${count} existing embeddings`);
  }

  // Load index into memory
  await loadEmbeddingIndex(envPath);

  // Start watcher for live updates
  watcher = startWatcher(
    vaultPath,
    db,
    {
      ollamaUrl,
      model: ollamaModel,
    },
    (event) => {
      console.error(`[Watcher] ${event.type}: ${event.path}`);
    },
  );

  console.error(
    "[Environment] Initialized successfully (watching for changes)",
  );
}

/**
 * Get the vault path
 */
export function getVaultPath(): string {
  if (!vaultPath) {
    throw new Error("Environment not initialized");
  }
  return vaultPath;
}

/**
 * Get the environment path
 */
export function getEnvPath(): string {
  if (!envPath) {
    throw new Error("Environment not initialized");
  }
  return envPath;
}

/**
 * Check if environment is initialized
 */
export function isInitialized(): boolean {
  return isIndexLoaded();
}
