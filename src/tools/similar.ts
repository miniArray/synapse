/**
 * Find notes semantically similar to a given note
 */

import { z } from "zod";
import { findNearestSources, getSourceVector } from "../embedding-index.js";
import type { NoteResult } from "../types.js";

export const SimilarNotesSchema = z.object({
  note_path: z
    .string()
    .describe('Path to the note (e.g., "Note.md" or "Folder/Note.md")'),
  limit: z.number().min(1).max(100).default(10).optional(),
  threshold: z.number().min(0).max(1).default(0.5).optional(),
});

export type SimilarNotesParams = z.infer<typeof SimilarNotesSchema>;

/**
 * Find notes semantically similar to a given note
 */
export function getSimilarNotes(
  params: SimilarNotesParams,
): ReadonlyArray<NoteResult> {
  const limit = params.limit ?? 10;
  const threshold = params.threshold ?? 0.5;

  // Get the source vector for the given note
  const sourceVec = getSourceVector(params.note_path);

  if (!sourceVec) {
    throw new Error(`Note not found or has no embedding: ${params.note_path}`);
  }

  // Find nearest sources, excluding the query note itself
  const results = findNearestSources(
    sourceVec,
    limit,
    threshold,
    params.note_path,
  );

  console.error(
    `[Similar] Found ${results.length} similar notes for: ${params.note_path}`,
  );

  return results;
}

export const similarNotesTool = {
  name: "get_similar_notes",
  description:
    "Find notes semantically similar to a given note using embeddings. Returns paths, similarity scores, and available blocks.",
  inputSchema: {
    type: "object" as const,
    properties: {
      note_path: {
        type: "string" as const,
        description: 'Path to the note (e.g., "Note.md" or "Folder/Note.md")',
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of results (default: 10)",
        default: 10,
      },
      threshold: {
        type: "number" as const,
        description: "Similarity threshold 0-1 (default: 0.5)",
        default: 0.5,
      },
    },
    required: ["note_path"],
  },
};
