/**
 * Type definitions for Smart Connections MCP server
 */

import { z } from "zod";

// Zod schemas for tool parameters
export const SearchNotesSchema = z.object({
  query: z.string().describe("Search query text"),
  limit: z.number().min(1).max(100).default(10).optional(),
  threshold: z.number().min(0).max(1).default(0.5).optional(),
});

export const SimilarNotesSchema = z.object({
  note_path: z
    .string()
    .describe('Path to the note (e.g., "Note.md" or "Folder/Note.md")'),
  limit: z.number().min(1).max(100).default(10).optional(),
  threshold: z.number().min(0).max(1).default(0.5).optional(),
});

export const ConnectionGraphSchema = z.object({
  note_path: z.string().describe("Path to the note to start from"),
  depth: z.number().min(1).max(5).default(2).optional(),
  max_per_level: z.number().min(1).max(20).default(5).optional(),
  threshold: z.number().min(0).max(1).default(0.6).optional(),
});

export const NoteContentSchema = z.object({
  note_path: z.string().describe("Path to the note"),
  include_blocks: z
    .array(z.string())
    .optional()
    .describe("Specific block headings to include"),
});

// Derived types from schemas
export type SearchNotesParams = z.infer<typeof SearchNotesSchema>;
export type SimilarNotesParams = z.infer<typeof SimilarNotesSchema>;
export type ConnectionGraphParams = z.infer<typeof ConnectionGraphSchema>;
export type NoteContentParams = z.infer<typeof NoteContentSchema>;

// Result types
export type NoteResult = {
  path: string;
  similarity: number;
  blocks: ReadonlyArray<string>;
};

export type ConnectionNode = {
  path: string;
  similarity: number;
  level: number;
  connections?: ReadonlyArray<ConnectionNode>;
};

export type EmbeddingIndex = {
  sources: Map<
    string,
    { path: string; vec: ReadonlyArray<number>; blocks: ReadonlyArray<string> }
  >;
  blocks: Map<
    string,
    { key: string; vec: ReadonlyArray<number>; sourcePath: string }
  >;
};
