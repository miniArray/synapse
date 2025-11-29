/**
 * Storage module exports
 */

export {
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
