/**
 * Environment configuration and initialization
 */

import { isIndexLoaded, loadEmbeddingIndex } from "./embedding-index.js";

// Configuration state
let envPath: string | null = null;
let vaultPath: string | null = null;

export type EnvironmentConfig = {
  vault_path: string;
  env_path: string;
};

/**
 * Initialize the environment by loading the embedding index
 */
export async function initializeEnvironment(
  config: EnvironmentConfig,
): Promise<void> {
  vaultPath = config.vault_path;
  envPath = config.env_path;

  console.error(`[Environment] Vault path: ${vaultPath}`);
  console.error(`[Environment] Env path: ${envPath}`);

  await loadEmbeddingIndex(envPath);

  console.error("[Environment] Initialized successfully");
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
