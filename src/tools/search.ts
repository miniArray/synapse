/**
 * Search notes using semantic embeddings
 *
 * Generates an embedding for the query text and finds similar notes
 * using cosine similarity against the pre-computed embeddings.
 */

import { z } from "zod";
import { generateQueryEmbedding } from "../embed-model.js";
import { findNearestSources } from "../embedding-index.js";
import type { NoteResult } from "../types.js";

export const SearchNotesSchema = z.object({
  query: z.string().describe("Search query text"),
  limit: z.number().min(1).max(100).default(10).optional(),
  threshold: z.number().min(0).max(1).default(0.5).optional(),
});

export type SearchNotesParams = z.infer<typeof SearchNotesSchema>;

/**
 * Search notes by query using semantic search
 *
 * Generates an embedding for the query and finds semantically similar notes.
 */
export async function searchNotes(
  params: SearchNotesParams,
): Promise<ReadonlyArray<NoteResult>> {
  const limit = params.limit ?? 10;
  const threshold = params.threshold ?? 0.5;

  console.error(`[Search] Generating embedding for: "${params.query}"`);

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(params.query);

  // Find similar notes using the query embedding
  const results = findNearestSources(queryEmbedding, limit, threshold);

  console.error(`[Search] Found ${results.length} results`);

  return results;
}

export const searchNotesTool = {
  name: "search_notes",
  description:
    "Search for notes using a text query. Returns notes ranked by relevance.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "Search query text",
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of results (default: 10)",
        default: 10,
      },
      threshold: {
        type: "number" as const,
        description: "Minimum relevance threshold 0-1 (default: 0.5)",
        default: 0.5,
      },
    },
    required: ["query"],
  },
};
