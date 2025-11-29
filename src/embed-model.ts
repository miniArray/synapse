/**
 * Embedding model service using Ollama
 */

const DEFAULT_MODEL = "nomic-embed-text";
const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://localhost:11434";

type OllamaEmbedResponse = {
  embeddings: number[][];
};

/**
 * Generate embedding for a single text query via Ollama
 */
export async function generateQueryEmbedding(
  query: string,
  model?: string,
  ollamaUrl?: string,
): Promise<ReadonlyArray<number>> {
  const embeddings = await generateEmbeddings([query], model, ollamaUrl);
  return embeddings[0];
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(
  texts: ReadonlyArray<string>,
  model?: string,
  ollamaUrl?: string,
): Promise<ReadonlyArray<ReadonlyArray<number>>> {
  const url = `${ollamaUrl ?? OLLAMA_URL}/api/embed`;
  const modelName = model ?? DEFAULT_MODEL;

  console.error(
    `[EmbedModel] Generating ${texts.length} embeddings via Ollama (${modelName})...`,
  );

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      input: texts,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as OllamaEmbedResponse;

  if (!data.embeddings || data.embeddings.length === 0) {
    throw new Error("No embeddings returned from Ollama");
  }

  console.error(
    `[EmbedModel] Got ${data.embeddings.length} embeddings (${data.embeddings[0].length} dims)`,
  );

  return data.embeddings;
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaHealth(ollamaUrl?: string): Promise<boolean> {
  try {
    const response = await fetch(`${ollamaUrl ?? OLLAMA_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get default model name
 */
export function getDefaultModel(): string {
  return process.env["OLLAMA_MODEL"] ?? DEFAULT_MODEL;
}
