/**
 * Basic tests for database module
 */

import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BlockEntry,
  deleteSource,
  deserializeVector,
  getAllSources,
  getBlocks,
  getSource,
  getSourceCount,
  openDatabase,
  type SourceEntry,
  saveBlocks,
  saveSource,
  serializeVector,
} from "./database.js";

// Test helpers
function createTestDb() {
  const dbPath = join(tmpdir(), `synapse-test-${Date.now()}.db`);
  const db = openDatabase(dbPath);
  return { db, dbPath };
}

function cleanupDb(dbPath: string) {
  try {
    unlinkSync(dbPath);
  } catch {
    // Ignore cleanup errors
  }
}

// Test vector serialization
console.log("Testing vector serialization...");
const vec = [0.1, 0.2, 0.3, -0.4, 1.0];
const serialized = serializeVector(vec);
const deserialized = deserializeVector(serialized);

if (deserialized.length !== vec.length) {
  throw new Error("Vector length mismatch");
}

for (let i = 0; i < vec.length; i++) {
  const diff = Math.abs((deserialized[i] ?? 0) - (vec[i] ?? 0));
  if (diff > 0.0001) {
    throw new Error(`Vector value mismatch at index ${i}`);
  }
}
console.log("✓ Vector serialization works");

// Test database operations
const { db, dbPath } = createTestDb();

try {
  // Test saving and retrieving sources
  console.log("Testing source operations...");

  const source1: SourceEntry = {
    path: "test/note1.md",
    contentHash: "hash1",
    mtime: Date.now(),
    embedding: [0.1, 0.2, 0.3],
    model: "text-embedding-3-small",
    updatedAt: Date.now(),
  };

  saveSource(db, source1);

  const retrieved = getSource(db, source1.path);
  if (!retrieved) {
    throw new Error("Failed to retrieve source");
  }

  if (retrieved.path !== source1.path) {
    throw new Error("Path mismatch");
  }

  if (retrieved.contentHash !== source1.contentHash) {
    throw new Error("Content hash mismatch");
  }

  console.log("✓ Source save/retrieve works");

  // Test getAllSources
  const source2: SourceEntry = {
    path: "test/note2.md",
    contentHash: "hash2",
    mtime: Date.now(),
    embedding: [0.4, 0.5, 0.6],
    model: "text-embedding-3-small",
    updatedAt: Date.now(),
  };

  saveSource(db, source2);

  const allSources = getAllSources(db);
  if (allSources.length !== 2) {
    throw new Error("Expected 2 sources");
  }

  console.log("✓ getAllSources works");

  // Test source count
  const count = getSourceCount(db);
  if (count !== 2) {
    throw new Error("Expected count of 2");
  }

  console.log("✓ getSourceCount works");

  // Test blocks
  console.log("Testing block operations...");

  const blocks: BlockEntry[] = [
    {
      blockKey: "test/note1.md#Section 1",
      embedding: [0.1, 0.2, 0.3],
      lineStart: 1,
      lineEnd: 5,
    },
    {
      blockKey: "test/note1.md#Section 2",
      embedding: [0.4, 0.5, 0.6],
      lineStart: 6,
      lineEnd: 10,
    },
  ];

  saveBlocks(db, source1.path, blocks);

  const retrievedBlocks = getBlocks(db, source1.path);
  if (retrievedBlocks.length !== 2) {
    throw new Error("Expected 2 blocks");
  }

  if (retrievedBlocks[0]?.blockKey !== blocks[0]?.blockKey) {
    throw new Error("Block key mismatch");
  }

  console.log("✓ Block save/retrieve works");

  // Test delete (should cascade to blocks)
  deleteSource(db, source1.path);

  const afterDelete = getSource(db, source1.path);
  if (afterDelete !== null) {
    throw new Error("Source should be deleted");
  }

  const blocksAfterDelete = getBlocks(db, source1.path);
  if (blocksAfterDelete.length !== 0) {
    throw new Error("Blocks should be deleted via cascade");
  }

  console.log("✓ Delete with cascade works");

  console.log("\n✓ All tests passed!");
} finally {
  db.close();
  cleanupDb(dbPath);
}
