import { createHash } from "node:crypto";

export type ParsedDocument = {
  fullText: string;
  contentHash: string;
  blocks: Array<{
    key: string;
    text: string;
    lineStart: number;
    lineEnd: number;
  }>;
};

/**
 * Parse markdown content into structured document with blocks
 */
export function parseMarkdown(content: string): ParsedDocument {
  const lines = content.split("\n");
  const { contentWithoutFrontmatter, frontmatterEndLine } =
    removeFrontmatter(lines);

  const fullText = contentWithoutFrontmatter.join("\n");
  const contentHash = computeContentHash(fullText);

  const blocks = extractBlocks(contentWithoutFrontmatter, frontmatterEndLine);

  return {
    fullText,
    contentHash,
    blocks,
  };
}

/**
 * Compute SHA-256 hash of text content
 */
export function computeContentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Remove YAML frontmatter from lines
 * Returns content without frontmatter and the line number where frontmatter ended
 */
function removeFrontmatter(lines: string[]): {
  contentWithoutFrontmatter: string[];
  frontmatterEndLine: number;
} {
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { contentWithoutFrontmatter: lines, frontmatterEndLine: 0 };
  }

  // Find closing ---
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      // Frontmatter ends at line i (0-indexed)
      // Return content starting from line i+1
      return {
        contentWithoutFrontmatter: lines.slice(i + 1),
        frontmatterEndLine: i + 1,
      };
    }
  }

  // No closing ---, treat as no frontmatter
  return { contentWithoutFrontmatter: lines, frontmatterEndLine: 0 };
}

/**
 * Extract blocks from markdown content based on headings
 */
function extractBlocks(
  lines: string[],
  lineOffset: number,
): ParsedDocument["blocks"] {
  const headingIndices: number[] = [];

  // Find all heading lines
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("#") && trimmed.match(/^#{1,6}\s+/)) {
      headingIndices.push(i);
    }
  }

  // If no headings found, return entire document as single block
  if (headingIndices.length === 0) {
    if (lines.length === 0) {
      return [];
    }

    return [
      {
        key: "document",
        text: lines.join("\n"),
        lineStart: lineOffset + 1,
        lineEnd: lineOffset + lines.length,
      },
    ];
  }

  const blocks: ParsedDocument["blocks"] = [];

  // Create blocks from heading to heading (or end of document)
  for (let i = 0; i < headingIndices.length; i++) {
    const startIdx = headingIndices[i];
    const endIdx =
      i < headingIndices.length - 1 ? headingIndices[i + 1] : lines.length;

    const blockLines = lines.slice(startIdx, endIdx);
    const headingLine = lines[startIdx].trim();

    blocks.push({
      key: headingLine,
      text: blockLines.join("\n"),
      lineStart: lineOffset + startIdx + 1, // Convert to 1-indexed
      lineEnd: lineOffset + endIdx, // Convert to 1-indexed, inclusive
    });
  }

  return blocks;
}
