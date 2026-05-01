import { describe, expect, it } from "vitest";

import { extractOfficeArtifactProto, type RoutaOfficeWasmReaderExports } from "../routa-office-wasm-reader";

describe("extractOfficeArtifactProto", () => {
  it("dispatches to the matching .NET reader export", () => {
    const calls: string[] = [];
    const reader: RoutaOfficeWasmReaderExports = {
      DocxReader: {
        ExtractDocxProto: () => {
          calls.push("docx");
          return new Uint8Array([1]);
        },
      },
      PptxReader: {
        ExtractSlidesProto: () => {
          calls.push("pptx");
          return new Uint8Array([2]);
        },
      },
      XlsxReader: {
        ExtractXlsxProto: () => {
          calls.push("xlsx");
          return new Uint8Array([3]);
        },
      },
    };

    expect(Array.from(extractOfficeArtifactProto(reader, new Uint8Array(), "docx"))).toEqual([1]);
    expect(Array.from(extractOfficeArtifactProto(reader, new Uint8Array(), "pptx"))).toEqual([2]);
    expect(Array.from(extractOfficeArtifactProto(reader, new Uint8Array(), "xlsx"))).toEqual([3]);
    expect(calls).toEqual(["docx", "pptx", "xlsx"]);
  });
});
