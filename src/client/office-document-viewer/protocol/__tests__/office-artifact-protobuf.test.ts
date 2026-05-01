import { describe, expect, it } from "vitest";

import { decodeRoutaOfficeArtifact } from "../office-artifact-protobuf";

const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;
const encoder = new TextEncoder();

describe("decodeRoutaOfficeArtifact", () => {
  it("decodes the Routa OfficeArtifact protobuf shape", () => {
    const payload = message([
      stringField(1, "xlsx"),
      stringField(2, "Budget"),
      messageField(3, message([stringField(1, "body.paragraph[0]"), stringField(2, "Hello")])),
      messageField(
        4,
        message([
          stringField(1, "Sheet1"),
          messageField(
            2,
            message([
              messageField(
                1,
                message([
                  stringField(1, "A1"),
                  stringField(2, "42"),
                  stringField(3, "SUM(A2:A3)"),
                ]),
              ),
            ]),
          ),
        ]),
      ),
      messageField(
        5,
        message([
          varintField(1, 1),
          stringField(2, "Intro"),
          messageField(3, message([stringField(1, "slides[1].text[0]"), stringField(2, "Title")])),
        ]),
      ),
      messageField(6, message([stringField(1, "warning"), stringField(2, "truncated")])),
      messageField(7, message([stringField(1, "reader"), stringField(2, "routa-office-wasm-reader")])),
      messageField(
        8,
        message([
          stringField(1, "rId5"),
          stringField(2, "slides[1].image[0]"),
          stringField(3, "image/png"),
          bytesField(4, new Uint8Array([1, 2, 3])),
        ]),
      ),
      messageField(
        9,
        message([
          stringField(1, "body.table[0]"),
          messageField(2, message([messageField(1, message([stringField(2, "Cell text")]))])),
        ]),
      ),
    ]);

    const artifact = decodeRoutaOfficeArtifact(payload);

    expect(artifact.sourceKind).toBe("xlsx");
    expect(artifact.title).toBe("Budget");
    expect(artifact.textBlocks[0]).toEqual({ path: "body.paragraph[0]", text: "Hello" });
    expect(artifact.sheets[0].rows[0].cells[0]).toEqual({
      address: "A1",
      formula: "SUM(A2:A3)",
      text: "42",
    });
    expect(artifact.slides[0].textBlocks[0].text).toBe("Title");
    expect(artifact.diagnostics[0]).toEqual({ level: "warning", message: "truncated" });
    expect(artifact.metadata.reader).toBe("routa-office-wasm-reader");
    expect(Array.from(artifact.images[0].bytes)).toEqual([1, 2, 3]);
    expect(artifact.images[0].contentType).toBe("image/png");
    expect(artifact.tables[0].rows[0].cells[0].text).toBe("Cell text");
  });

  it("skips unknown length-delimited fields", () => {
    const payload = message([stringField(1, "docx"), stringField(99, "future")]);

    expect(decodeRoutaOfficeArtifact(payload).sourceKind).toBe("docx");
  });
});

function message(fields: Uint8Array[]): Uint8Array {
  return concat(fields);
}

function stringField(fieldNumber: number, value: string): Uint8Array {
  const bytes = encoder.encode(value);
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(bytes.length), bytes]);
}

function messageField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(value.length), value]);
}

function bytesField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(value.length), value]);
}

function varintField(fieldNumber: number, value: number): Uint8Array {
  return concat([tag(fieldNumber, WIRE_VARINT), varint(value)]);
}

function tag(fieldNumber: number, wireType: number): Uint8Array {
  return varint(fieldNumber * 8 + wireType);
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let next = value;
  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next = Math.floor(next / 0x80);
  }
  bytes.push(next);
  return new Uint8Array(bytes);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
