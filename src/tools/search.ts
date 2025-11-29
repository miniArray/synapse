/**
 * Search notes using text query
 *
 * Note: This implementation searches using existing embeddings only.
 * For text queries, we would need an embedding model. For now, we
 * search by finding notes whose content matches the query semantically
 * by comparing against all stored embeddings.
 */

import { z } from "zod";
import { getIndex } from "../embedding-index.js";
import type { NoteResult } from "../types.js";

export const SearchNotesSchema = z.object({
  query: z.string().describe("Search query text"),
  limit: z.number().min(1).max(100).default(10).optional(),
  threshold: z.number().min(0).max(1).default(0.5).optional(),
});

export type SearchNotesParams = z.infer<typeof SearchNotesSchema>;

/**
 * Search notes by query
 *
 * Since we don't have an embedding model loaded, this performs a
 * keyword-based fallback search matching the query against note paths.
 * For true semantic search, use get_similar_notes with a known note path.
 */
export function searchNotes(
  params: SearchNotesParams,
): ReadonlyArray<NoteResult> {
  const limit = params.limit ?? 10;
  const threshold = params.threshold ?? 0.5;
  const query = params.query.toLowerCase();
  const idx = getIndex();

  // Keyword search fallback - match query terms against paths
  const results: Array<NoteResult> = [];

  for (const [path, source] of idx.sources) {
    const pathLower = path.toLowerCase();

    // Simple relevance scoring based on query term matches
    const queryTerms = query.split(/\s+/).filter((t) => t.length > 0);
    let matchCount = 0;

    for (const term of queryTerms) {
      if (pathLower.includes(term)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Calculate a pseudo-similarity score based on match ratio
      const similarity = matchCount / queryTerms.length;
      if (similarity >= threshold) {
        results.push({
          path,
          similarity,
          blocks: source.blocks,
        });
      }
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  console.error(
    `[Search] Found ${Math.min(results.length, limit)} results for: "${params.query}"`,
  );

  return results.slice(0, limit);
}

export const searchNotesTool = {
  name: "search_notes",
  description:
    "Search for notes using a text query. Returns notes ranked by relevance. Note: For true semantic search, use get_similar_notes with a known note path.",
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
