/**
 * Unit tests for file range extractor
 */

import { describe, it, expect } from "vitest";
import {
  extractFilesFromToolCall,
  computeContentHash,
} from "@/core/trace";

describe("File Range Extractor", () => {
  describe("extractFilesFromToolCall", () => {
    it("should extract file path from Read tool", () => {
      const params = {
        file_path: "/path/to/file.ts",
        offset: 1,
        limit: 100,
      };

      const files = extractFilesFromToolCall("Read", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/path/to/file.ts");
      expect(files[0].operation).toBe("read");
      expect(files[0].ranges).toBeUndefined();
    });

    it("should extract file path from Write tool", () => {
      const params = {
        file_path: "/path/to/file.ts",
        content: "hello world",
      };

      const files = extractFilesFromToolCall("Write", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/path/to/file.ts");
      expect(files[0].operation).toBe("write");
    });

    it("should extract file path and ranges from Edit tool with explicit line range", () => {
      const params = {
        file_path: "/path/to/file.ts",
        startLine: 10,
        endLine: 20,
        oldStr: "old",
        newStr: "new",
      };

      const files = extractFilesFromToolCall("Edit", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/path/to/file.ts");
      expect(files[0].operation).toBe("edit");
      expect(files[0].ranges).toHaveLength(1);
      expect(files[0].ranges?.[0]).toEqual({
        startLine: 10,
        endLine: 20,
      });
    });

    it("should extract file path and ranges from Edit tool with oldLine/newLine", () => {
      const params = {
        file_path: "/path/to/file.ts",
        oldLine: 5,
        newLine: 15,
        oldStr: "old code",
        newStr: "new code",
      };

      const files = extractFilesFromToolCall("Edit", params);
      expect(files).toHaveLength(1);
      expect(files[0].ranges).toHaveLength(1);
      expect(files[0].ranges?.[0]).toEqual({
        startLine: 5,
        endLine: 15,
      });
    });

    it("should handle Edit tool without line ranges", () => {
      const params = {
        file_path: "/path/to/file.ts",
        oldStr: "old",
        newStr: "new",
      };

      const files = extractFilesFromToolCall("Edit", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/path/to/file.ts");
      expect(files[0].ranges).toBeUndefined();
    });

    it("should extract multiple files from MultiEdit", () => {
      const params = {
        edits: [
          {
            file_path: "/path/to/file1.ts",
            oldLine: 1,
            newLine: 10,
            oldStr: "old",
            newStr: "new",
          },
          {
            file_path: "/path/to/file2.ts",
            startLine: 20,
            endLine: 30,
            oldStr: "old2",
            newStr: "new2",
          },
        ],
      };

      const files = extractFilesFromToolCall("MultiEdit", params);
      expect(files).toHaveLength(2);
      expect(files[0].path).toBe("/path/to/file1.ts");
      expect(files[0].ranges?.[0]).toEqual({ startLine: 1, endLine: 10 });
      expect(files[1].path).toBe("/path/to/file2.ts");
      expect(files[1].ranges?.[0]).toEqual({ startLine: 20, endLine: 30 });
    });

    it("should normalize MCP tool names", () => {
      const params = {
        file_path: "/path/to/file.ts",
      };

      const files1 = extractFilesFromToolCall("Read", params);
      const files2 = extractFilesFromToolCall("mcp__my-server__Read", params);
      const files3 = extractFilesFromToolCall("mcp__server__sub__Read", params);

      expect(files1).toHaveLength(1);
      expect(files2).toHaveLength(1);
      expect(files3).toHaveLength(1);
    });

    it("should return empty array for non-file tools", () => {
      const params = {
        query: "test",
      };

      const files = extractFilesFromToolCall("WebSearch", params);
      expect(files).toHaveLength(0);
    });

    it("should return empty array when params are undefined", () => {
      const files = extractFilesFromToolCall("Read", undefined);
      expect(files).toHaveLength(0);
    });

    it("should handle 'path' parameter as fallback", () => {
      const params = {
        path: "/path/to/file.ts",
      };

      const files = extractFilesFromToolCall("Read", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/path/to/file.ts");
    });

    it("should prioritize 'file_path' over 'path'", () => {
      const params = {
        file_path: "/correct/path.ts",
        path: "/wrong/path.ts",
      };

      const files = extractFilesFromToolCall("Read", params);
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/correct/path.ts");
    });
  });

  describe("computeContentHash", () => {
    it("should generate consistent hash for same input", async () => {
      const hash1 = await computeContentHash("test.ts", "content");
      const hash2 = await computeContentHash("test.ts", "content");

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different content", async () => {
      const hash1 = await computeContentHash("test.ts", "content");
      const hash2 = await computeContentHash("test.ts", "different");

      expect(hash1).not.toBe(hash2);
    });

    it("should generate different hash for different file path", async () => {
      const hash1 = await computeContentHash("file1.ts", "content");
      const hash2 = await computeContentHash("file2.ts", "content");

      expect(hash1).not.toBe(hash2);
    });

    it("should handle undefined content", async () => {
      const hash = await computeContentHash("test.ts", undefined);
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle empty content", async () => {
      const hash1 = await computeContentHash("test.ts", "");
      const hash2 = await computeContentHash("test.ts", undefined);

      // Empty content and undefined should produce different hashes
      // since we include the content in the hash
      expect(hash1).not.toBe(hash2);
    });
  });
});
