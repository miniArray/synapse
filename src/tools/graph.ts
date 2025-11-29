/**
 * Build multi-level connection graph from a note
 */

import { z } from "zod";
import { findNearestSources, getSourceVector } from "../embedding-index.js";
import type { ConnectionNode } from "../types.js";

export const ConnectionGraphSchema = z.object({
  note_path: z.string().describe("Path to the note to start from"),
  depth: z.number().min(1).max(5).default(2).optional(),
  max_per_level: z.number().min(1).max(20).default(5).optional(),
  threshold: z.number().min(0).max(1).default(0.6).optional(),
});

export type ConnectionGraphParams = z.infer<typeof ConnectionGraphSchema>;

/**
 * Recursively build the connection graph
 */
function buildGraphLevel(
  notePath: string,
  currentDepth: number,
  maxDepth: number,
  maxPerLevel: number,
  threshold: number,
  visited: Set<string>,
): ConnectionNode | null {
  const sourceVec = getSourceVector(notePath);

  if (!sourceVec) {
    return null;
  }

  visited.add(notePath);

  // Base case: reached max depth
  if (currentDepth >= maxDepth) {
    return {
      path: notePath,
      similarity: 1.0,
      level: currentDepth,
    };
  }

  // Find nearest sources, excluding visited notes
  const results = findNearestSources(sourceVec, maxPerLevel * 2, threshold);

  // Filter out visited notes and limit
  const filteredResults = results
    .filter((r) => !visited.has(r.path))
    .slice(0, maxPerLevel);

  // Recursively build child connections
  const childConnections: Array<ConnectionNode> = [];

  for (const result of filteredResults) {
    const childNode = buildGraphLevel(
      result.path,
      currentDepth + 1,
      maxDepth,
      maxPerLevel,
      threshold,
      visited,
    );

    if (childNode) {
      childConnections.push({
        ...childNode,
        similarity: result.similarity,
      });
    }
  }

  return {
    path: notePath,
    similarity: 1.0,
    level: currentDepth,
    connections: childConnections.length > 0 ? childConnections : undefined,
  };
}

/**
 * Build a multi-level connection graph starting from a note
 */
export function getConnectionGraph(
  params: ConnectionGraphParams,
): ConnectionNode | null {
  const depth = params.depth ?? 2;
  const maxPerLevel = params.max_per_level ?? 5;
  const threshold = params.threshold ?? 0.6;

  const visited = new Set<string>();
  const graph = buildGraphLevel(
    params.note_path,
    0,
    depth,
    maxPerLevel,
    threshold,
    visited,
  );

  console.error(
    `[Graph] Built graph for: ${params.note_path} (depth: ${depth}, visited: ${visited.size})`,
  );

  return graph;
}

export const connectionGraphTool = {
  name: "get_connection_graph",
  description:
    "Build a multi-level connection graph starting from a note, showing how notes are semantically connected.",
  inputSchema: {
    type: "object" as const,
    properties: {
      note_path: {
        type: "string" as const,
        description: "Path to the note to start from",
      },
      depth: {
        type: "number" as const,
        description: "Depth of the connection graph (default: 2)",
        default: 2,
      },
      max_per_level: {
        type: "number" as const,
        description: "Maximum connections per level (default: 5)",
        default: 5,
      },
      threshold: {
        type: "number" as const,
        description: "Similarity threshold 0-1 (default: 0.6)",
        default: 0.6,
      },
    },
    required: ["note_path"],
  },
};
