"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveApiPath } from "@/client/config/backend";
import { toErrorMessage } from "@/client/utils/diagnostics";
import { useTranslation } from "@/i18n";

import {
  OFFICE_WASM_ASSET_ROUTE,
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
  OFFICE_WASM_READER_MODULES,
} from "./office-wasm-config";

type ArtifactKind = "csv" | "tsv" | "docx" | "pptx" | "xlsx";
type ParseStage = "idle" | "initializing" | "parsing" | "ready" | "error";

type ParsedArtifact = {
  kind: "document" | "presentation" | "spreadsheet";
  sourceKind: ArtifactKind;
  proto: unknown;
};

type RecordValue = Record<string, unknown>;

type ImageSource = {
  id: string;
  src: string;
};

type PreviewLabels = {
  visualPreview: string;
  rawJson: string;
  sheet: string;
  slide: string;
  noSheets: string;
  noSlides: string;
  noDocumentBlocks: string;
  showingFirstRows: string;
  shapes: string;
  textRuns: string;
};

type WalnutReader = {
  DocxReader: {
    ExtractDocxProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
  PptxReader: {
    ExtractSlidesProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
  XlsxReader: {
    ExtractXlsxProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
};

const ASSET_BASE_URL = resolveApiPath(OFFICE_WASM_ASSET_ROUTE);
const WORKBOOK_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.workbook}`;
const DOCUMENT_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.document}`;
const PRESENTATION_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.presentation}`;
const SPREADSHEET_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.spreadsheet}`;
const DOTNET_JS = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.dotnet}`;

let cachedWalnutRuntime: Promise<WalnutReader> | null = null;

async function getWalnutReader(): Promise<WalnutReader> {
  if (!cachedWalnutRuntime) {
    cachedWalnutRuntime = (async () => {
      const dotnet = await import(
        /* webpackIgnore: true */ `${DOTNET_JS}?v=walnut-runtime`
      );
      const runtime = await dotnet.dotnet
        .withConfig({
          ...OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
          resources: {
            ...OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources,
          },
        })
        .withResourceLoader((resourceType: string, _name: string, defaultUri: string, integrity: string) => {
          if (resourceType === "dotnetjs") {
            return defaultUri;
          }

          const url = new URL(defaultUri, window.location.href);
          if (url.origin === window.location.origin) {
            return url.href;
          }

          return fetch(url.href, { credentials: "omit", integrity });
        })
        .create();

      return runtime.getAssemblyExports("Walnut") as Promise<WalnutReader>;
    })().catch((error: unknown) => {
      cachedWalnutRuntime = null;
      throw new Error(`Walnut runtime init failed: ${toErrorMessage(error)}`);
    });
  }

  return cachedWalnutRuntime;
}

function detectFileKind(fileName: string): ArtifactKind | null {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "tsv") return "tsv";
  if (extension === "docx") return "docx";
  if (extension === "pptx") return "pptx";
  if (extension === "xlsx") return "xlsx";
  return null;
}

async function parseSpreadsheetFromCsv(file: File, separator?: string): Promise<ParsedArtifact> {
  const { Workbook } = (await import(
    /* webpackIgnore: true */ `${WORKBOOK_MODULE}?v=workbook`
  )) as {
    Workbook: {
      fromCSV: (text: string, options?: { separator?: string }) => {
        toProto: () => unknown;
      };
    };
  };
  const fileBytes = await file.arrayBuffer();
  const asText = new TextDecoder().decode(fileBytes);
  const workbook = await Workbook.fromCSV(asText, separator ? { separator } : undefined);
  return { kind: "spreadsheet", sourceKind: file.name.endsWith(".tsv") ? "tsv" : "csv", proto: workbook.toProto() };
}

async function parseDocument(file: File, kind: "docx" | "pptx" | "xlsx"): Promise<ParsedArtifact> {
  const walnut = await getWalnutReader();
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (kind === "docx") {
    const { Document } = (await import(
      /* webpackIgnore: true */ `${DOCUMENT_MODULE}?v=document`
    )) as { Document: { decode: (value: unknown) => unknown } };
    const proto = Document.decode(walnut.DocxReader.ExtractDocxProto(bytes, false));
    return { kind: "document", sourceKind: "docx", proto };
  }

  if (kind === "pptx") {
    const { Presentation } = (await import(
      /* webpackIgnore: true */ `${PRESENTATION_MODULE}?v=presentation`
    )) as { Presentation: { decode: (value: unknown) => unknown } };
    const proto = Presentation.decode(walnut.PptxReader.ExtractSlidesProto(bytes, false));
    return { kind: "presentation", sourceKind: "pptx", proto };
  }

  const { Workbook } = (await import(
    /* webpackIgnore: true */ `${SPREADSHEET_MODULE}?v=spreadsheet`
  )) as { Workbook: { decode: (value: unknown) => unknown } };
  const proto = Workbook.decode(walnut.XlsxReader.ExtractXlsxProto(bytes, false));
  return { kind: "spreadsheet", sourceKind: "xlsx", proto };
}

function truncateJson(rawJson: string): string {
  const maxLength = 50_000;
  if (rawJson.length <= maxLength) return rawJson;
  return `${rawJson.slice(0, maxLength)}\n... (truncated)`;
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null ? (value as RecordValue) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bytesFromUnknown(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return new Uint8Array(value);
  }

  const record = asRecord(value);
  if (record == null) return null;

  const numericKeys = Object.keys(record)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((left, right) => left - right);

  if (numericKeys.length === 0) return null;

  const bytes = new Uint8Array(numericKeys.length);
  for (const key of numericKeys) {
    bytes[key] = asNumber(record[String(key)]);
  }

  return bytes;
}

function inferImageContentType(id: string): string {
  const extension = id.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function hexToRgb(value: string): { red: number; green: number; blue: number } | null {
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function colorAlpha(value: unknown): number {
  const transform = asRecord(asRecord(value)?.transform);
  const alpha = transform?.alpha;
  if (typeof alpha !== "number" || !Number.isFinite(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha / 100_000));
}

function colorToCss(value: unknown): string | undefined {
  const color = asRecord(value);
  const raw = asString(color?.value);
  const rgb = hexToRgb(raw);
  if (rgb) {
    const alpha = colorAlpha(color);
    if (alpha < 1) return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${alpha})`;
    return `#${raw}`;
  }

  const lastColor = asString(color?.lastColor);
  const lastRgb = hexToRgb(lastColor);
  if (lastRgb) return `#${lastColor}`;
  return undefined;
}

function fillToCss(fill: unknown): string | undefined {
  const fillRecord = asRecord(fill);
  if (fillRecord == null || asNumber(fillRecord.type) === 0) return undefined;
  return colorToCss(fillRecord.color);
}

function lineToCss(line: unknown): { color?: string; width: number } {
  const lineRecord = asRecord(line);
  const fillRecord = asRecord(lineRecord?.fill);
  const color = colorToCss(fillRecord?.color);
  const width = Math.max(1, Math.min(4, asNumber(lineRecord?.widthEmu) / 9_000));
  return { color, width };
}

function slideBackgroundToCss(slide: RecordValue): string {
  const background = asRecord(slide.background);
  const fill = asRecord(background?.fill);
  return fillToCss(fill) ?? "#ffffff";
}

function imageReferenceId(value: unknown): string {
  const record = asRecord(value);
  return asString(record?.id);
}

function elementImageReferenceId(element: RecordValue): string {
  const direct = imageReferenceId(element.imageReference);
  if (direct) return direct;

  const fill = asRecord(element.fill);
  const fillImage = imageReferenceId(fill?.imageReference);
  if (fillImage) return fillImage;

  const shapeFill = asRecord(asRecord(element.shape)?.fill);
  return imageReferenceId(shapeFill?.imageReference);
}

function paragraphText(paragraph: unknown): string {
  const runs = asArray(asRecord(paragraph)?.runs);
  return runs.map((run) => asString(asRecord(run)?.text)).join("");
}

function collectTextBlocks(value: unknown, limit = 80): string[] {
  const blocks: string[] = [];
  const seen = new WeakSet<object>();

  function visit(node: unknown) {
    if (blocks.length >= limit) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const record = asRecord(node);
    if (record == null || seen.has(record)) return;
    seen.add(record);

    const paragraphs = asArray(record.paragraphs);
    if (paragraphs.length > 0) {
      const text = paragraphs.map(paragraphText).filter(Boolean).join("\n");
      if (text.trim()) blocks.push(text);
    }

    for (const child of Object.values(record)) {
      if (typeof child === "object" && child !== null) {
        visit(child);
      }
    }
  }

  visit(value);
  return blocks;
}

function columnIndexFromAddress(address: string): number {
  const match = address.match(/^[A-Z]+/i);
  if (!match) return 0;

  let index = 0;
  for (const char of match[0].toUpperCase()) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }

  return Math.max(0, index - 1);
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function cellText(cell: unknown): string {
  const record = asRecord(cell);
  if (record == null) return "";

  const value = asString(record.value);
  if (value) return value;

  const paragraphs = asArray(record.paragraphs);
  return paragraphs.map(paragraphText).filter(Boolean).join("\n");
}

function OfficePreview({
  artifact,
  labels,
}: {
  artifact: ParsedArtifact;
  labels: PreviewLabels;
}) {
  if (artifact.kind === "spreadsheet") {
    return <SpreadsheetPreview labels={labels} proto={artifact.proto} />;
  }

  if (artifact.kind === "presentation") {
    return <PresentationPreview labels={labels} proto={artifact.proto} />;
  }

  return <DocumentPreview labels={labels} proto={artifact.proto} />;
}

function SpreadsheetPreview({ labels, proto }: { labels: PreviewLabels; proto: unknown }) {
  const sheets = asArray(asRecord(proto)?.sheets).map(asRecord).filter((sheet): sheet is RecordValue => sheet != null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const activeSheet = sheets[Math.min(activeSheetIndex, Math.max(0, sheets.length - 1))];

  const rows = asArray(activeSheet?.rows).map(asRecord).filter((row): row is RecordValue => row != null);
  let maxColumn = 0;
  const rowsByIndex = new Map<number, Map<number, string>>();

  for (const row of rows) {
    const rowIndex = asNumber(row.index, 1);
    const cells = new Map<number, string>();
    for (const cell of asArray(row.cells)) {
      const cellRecord = asRecord(cell);
      const address = asString(cellRecord?.address);
      const columnIndex = columnIndexFromAddress(address);
      maxColumn = Math.max(maxColumn, columnIndex);
      cells.set(columnIndex, cellText(cell));
    }
    rowsByIndex.set(rowIndex, cells);
  }

  const maxRow = Math.min(Math.max(...rowsByIndex.keys(), 1), 40);
  const columnCount = Math.min(Math.max(maxColumn + 1, 6), 18);

  if (sheets.length === 0) {
    return <p style={{ color: "#64748b" }}>{labels.noSheets}</p>;
  }

  return (
    <div data-testid="spreadsheet-preview" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {sheets.map((sheet, index) => (
          <button
            key={`${asString(sheet.sheetId)}-${index}`}
            onClick={() => setActiveSheetIndex(index)}
            style={{
              border: "1px solid #cbd5e1",
              background: index === activeSheetIndex ? "#0f172a" : "#ffffff",
              color: index === activeSheetIndex ? "#ffffff" : "#0f172a",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
            }}
            type="button"
          >
            {asString(sheet.name) || `${labels.sheet} ${index + 1}`}
          </button>
        ))}
      </div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{labels.showingFirstRows}</div>
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, overflow: "auto", maxHeight: 520 }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={sheetHeaderStyle} />
              {Array.from({ length: columnCount }, (_, index) => (
                <th key={index} style={sheetHeaderStyle}>{columnLabel(index)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRow }, (_, rowOffset) => {
              const rowIndex = rowOffset + 1;
              const row = rowsByIndex.get(rowIndex);
              return (
                <tr key={rowIndex}>
                  <th style={sheetHeaderStyle}>{rowIndex}</th>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <td key={columnIndex} style={sheetCellStyle}>
                      {row?.get(columnIndex) ?? ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const sheetHeaderStyle = {
  background: "#f8fafc",
  borderBottom: "1px solid #cbd5e1",
  borderRight: "1px solid #e2e8f0",
  color: "#475569",
  minWidth: 88,
  padding: "7px 9px",
  position: "sticky" as const,
  top: 0,
};

const sheetCellStyle = {
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
  color: "#0f172a",
  minWidth: 88,
  padding: "7px 9px",
  verticalAlign: "top" as const,
  whiteSpace: "pre-wrap" as const,
};

function PresentationPreview({ labels, proto }: { labels: PreviewLabels; proto: unknown }) {
  const root = asRecord(proto);
  const slides = asArray(root?.slides).map(asRecord).filter((slide): slide is RecordValue => slide != null);
  const imageSources = usePresentationImageSources(root);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const selectedSlideIndex = Math.min(activeSlideIndex, Math.max(0, slides.length - 1));
  const selectedSlide = slides[selectedSlideIndex] ?? {};

  if (slides.length === 0) {
    return <p style={{ color: "#64748b" }}>{labels.noSlides}</p>;
  }

  return (
    <div
      data-testid="presentation-preview"
      style={{
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        display: "grid",
        gridTemplateColumns: "minmax(150px, 220px) minmax(0, 1fr)",
        minHeight: 620,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderRight: "1px solid #cbd5e1",
          display: "grid",
          gap: 10,
          maxHeight: 720,
          overflowY: "auto",
          padding: 12,
        }}
      >
        {slides.map((slide, index) => (
          <button
            key={`${asString(slide.id)}-${index}`}
            onClick={() => setActiveSlideIndex(index)}
            style={{
              background: "transparent",
              border: "0",
              color: "#0f172a",
              cursor: "pointer",
              display: "grid",
              gap: 6,
              padding: 0,
              textAlign: "left",
            }}
            type="button"
          >
            <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>
              {labels.slide} {asNumber(slide.index, index + 1)}
            </span>
            <SlideFrame
              compact
              imageSources={imageSources}
              isActive={index === selectedSlideIndex}
              slide={slide}
            />
          </button>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <SlideCanvas
          imageSources={imageSources}
          labels={labels}
          slide={selectedSlide}
          slideIndex={selectedSlideIndex}
        />
      </div>
    </div>
  );
}

function SlideCanvas({
  imageSources,
  labels,
  slide,
  slideIndex,
}: {
  imageSources: Map<string, string>;
  labels: PreviewLabels;
  slide: RecordValue;
  slideIndex: number;
}) {
  const elements = asArray(slide.elements).map(asRecord).filter((element): element is RecordValue => element != null);
  const textRunCount = elements.reduce((count, element) => {
    return count + collectTextBlocks(element, 20).length;
  }, 0);

  return (
    <article style={{ display: "grid", gap: 12, minHeight: 0, overflow: "auto", padding: 18 }}>
      <div style={{ color: "#475569", display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
        <strong>{labels.slide} {asNumber(slide.index, slideIndex + 1)}</strong>
        <span>{elements.length} {labels.shapes}</span>
        <span>{textRunCount} {labels.textRuns}</span>
      </div>
      <SlideFrame imageSources={imageSources} slide={slide} />
    </article>
  );
}

function usePresentationImageSources(root: RecordValue | null): Map<string, string> {
  const imageRecords = useMemo(() => {
    return asArray(root?.images).map(asRecord).filter((image): image is RecordValue => image != null);
  }, [root]);

  const imageSources = useMemo(() => {
    const sources: ImageSource[] = [];
    for (const image of imageRecords) {
      const id = asString(image.id);
      if (!id) continue;

      const uri = asString(image.uri);
      if (uri) {
        sources.push({ id, src: uri });
        continue;
      }

      const bytes = bytesFromUnknown(image.data);
      if (bytes == null || bytes.byteLength === 0) continue;

      const contentType = asString(image.contentType) || inferImageContentType(id);
      const payload = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(payload).set(bytes);
      const blob = new Blob([payload], { type: contentType });
      sources.push({ id, src: URL.createObjectURL(blob) });
    }

    return sources;
  }, [imageRecords]);

  useEffect(() => {
    return () => {
      for (const image of imageSources) {
        if (image.src.startsWith("blob:")) {
          URL.revokeObjectURL(image.src);
        }
      }
    };
  }, [imageSources]);

  return useMemo(() => {
    return new Map(imageSources.map((image) => [image.id, image.src]));
  }, [imageSources]);
}

function slideBounds(slide: RecordValue): { width: number; height: number } {
  const elements = asArray(slide.elements).map(asRecord).filter((element): element is RecordValue => element != null);
  return elements.reduce<{ width: number; height: number }>(
    (acc, element) => {
      const bbox = asRecord(element.bbox);
      return {
        width: Math.max(acc.width, asNumber(bbox?.xEmu) + asNumber(bbox?.widthEmu)),
        height: Math.max(acc.height, asNumber(bbox?.yEmu) + asNumber(bbox?.heightEmu)),
      };
    },
    { width: 12_192_000, height: 6_858_000 },
  );
}

function SlideFrame({
  compact = false,
  imageSources,
  isActive = false,
  slide,
}: {
  compact?: boolean;
  imageSources: Map<string, string>;
  isActive?: boolean;
  slide: RecordValue;
}) {
  const elements = asArray(slide.elements).map(asRecord).filter((element): element is RecordValue => element != null);
  const bounds = slideBounds(slide);
  const background = slideBackgroundToCss(slide);

  return (
    <div
      style={{
        aspectRatio: `${bounds.width} / ${bounds.height}`,
        background,
        border: `1px solid ${isActive ? "#0285ff" : "#cbd5e1"}`,
        borderRadius: 6,
        boxShadow: isActive ? "0 0 0 2px rgba(2, 133, 255, 0.18)" : "0 8px 22px rgba(15, 23, 42, 0.12)",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {elements.map((element, index) => (
        <SlideElement
          bounds={bounds}
          compact={compact}
          element={element}
          imageSources={imageSources}
          key={`${asString(element.id)}-${index}`}
        />
      ))}
    </div>
  );
}

function SlideElement({
  bounds,
  compact,
  element,
  imageSources,
}: {
  bounds: { width: number; height: number };
  compact: boolean;
  element: RecordValue;
  imageSources: Map<string, string>;
}) {
  const bbox = asRecord(element.bbox);
  const shape = asRecord(element.shape);
  const text = asArray(element.paragraphs).map(paragraphText).filter(Boolean).join("\n");
  const firstRun = asRecord(asArray(asRecord(asArray(element.paragraphs)[0])?.runs)[0]);
  const textStyle = asRecord(firstRun?.textStyle);
  const fill = fillToCss(shape?.fill);
  const line = lineToCss(shape?.line);
  const textColor = colorToCss(asRecord(textStyle?.fill)?.color) ?? "#0f172a";
  const fontScale = compact ? 0.15 : 1;
  const fontSize = Math.max(compact ? 2 : 10, Math.min(44, asNumber(textStyle?.fontSize, 1200) / 100) * fontScale);
  const imageId = elementImageReferenceId(element);
  const imageSrc = imageId ? imageSources.get(imageId) : undefined;
  const heightEmu = asNumber(bbox?.heightEmu);
  const isLine = heightEmu === 0 && line.color != null;
  const borderRadius = shape?.geometry === 35 || shape?.geometry === 89 ? "999px" : 3;

  return (
    <div
      style={{
        alignItems: "center",
        background: text ? "transparent" : fill,
        borderColor: !isLine ? line.color : undefined,
        borderRadius,
        borderStyle: !isLine && line.color ? "solid" : undefined,
        borderTopColor: isLine ? line.color : undefined,
        borderTopStyle: isLine && line.color ? "solid" : undefined,
        borderTopWidth: isLine && line.color ? line.width : undefined,
        borderWidth: !isLine && line.color ? line.width : undefined,
        color: textColor,
        display: "flex",
        fontSize,
        fontWeight: textStyle?.bold === true ? 700 : 400,
        height: `${(asNumber(bbox?.heightEmu) / bounds.height) * 100}%`,
        left: `${(asNumber(bbox?.xEmu) / bounds.width) * 100}%`,
        lineHeight: 1.15,
        overflow: "hidden",
        padding: text ? (compact ? "0.05em" : "0.15em") : 0,
        position: "absolute",
        top: `${(asNumber(bbox?.yEmu) / bounds.height) * 100}%`,
        transform: `rotate(${asNumber(bbox?.rotation) / 60000}deg)`,
        whiteSpace: "pre-wrap",
        width: `${(asNumber(bbox?.widthEmu) / bounds.width) * 100}%`,
      }}
      title={asString(element.name)}
    >
      {imageSrc ? (
        <span
          aria-hidden="true"
          style={{
            backgroundImage: `url("${imageSrc}")`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            height: "100%",
            inset: 0,
            position: "absolute",
            width: "100%",
          }}
        />
      ) : null}
      {text ? <span style={{ position: "relative", zIndex: 1 }}>{text}</span> : null}
    </div>
  );
}

function DocumentPreview({ labels, proto }: { labels: PreviewLabels; proto: unknown }) {
  const root = asRecord(proto);
  const elements = asArray(root?.elements);
  const blocks = collectTextBlocks(elements.length > 0 ? elements : proto, 120);

  if (blocks.length === 0) {
    return <p style={{ color: "#64748b" }}>{labels.noDocumentBlocks}</p>;
  }

  return (
    <div data-testid="document-preview" style={{ display: "grid", gap: 10 }}>
      {blocks.map((block, index) => (
        <p
          key={`${block.slice(0, 24)}-${index}`}
          style={{
            borderBottom: "1px solid #e2e8f0",
            color: "#0f172a",
            lineHeight: 1.6,
            margin: 0,
            paddingBottom: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          {block}
        </p>
      ))}
    </div>
  );
}

function statusLabel(t: ReturnType<typeof useTranslation>["t"], status: ParseStage): string {
  switch (status) {
    case "idle":
      return t.debug.officeWasmPocStatusIdle;
    case "initializing":
      return t.debug.officeWasmPocStatusInitializing;
    case "parsing":
      return t.debug.officeWasmPocStatusParsing;
    case "ready":
      return t.debug.officeWasmPocStatusReady;
    case "error":
      return t.debug.officeWasmPocStatusError;
  }
}

export function OfficeWasmPocPageClient() {
  const { t } = useTranslation();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [artifact, setArtifact] = useState<ParsedArtifact | null>(null);
  const [status, setStatus] = useState<ParseStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastBytes, setLastBytes] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setSelectedFileName("");
    setArtifact(null);
    setErrorMessage(null);
    setStatus("idle");
    setLastBytes(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const parseFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0];
      if (!selected) {
        reset();
        return;
      }

      const kind = detectFileKind(selected.name);
      if (!kind) {
        reset();
        setErrorMessage(t.debug.unsupportedOfficeFormat);
        return;
      }

      setSelectedFileName(selected.name);
      setStatus("initializing");
      setErrorMessage(null);
      setIsBusy(true);
      setArtifact(null);

      try {
        setStatus("parsing");
        let parsed: ParsedArtifact;

        if (kind === "csv" || kind === "tsv") {
          parsed = await parseSpreadsheetFromCsv(selected, kind === "tsv" ? "\t" : undefined);
        } else {
          parsed = await parseDocument(selected, kind);
        }

        setArtifact(parsed);
        setLastBytes(selected.size);
        setStatus("ready");
      } catch (error: unknown) {
        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      } finally {
        setIsBusy(false);
      }
    },
    [reset, t.debug.unsupportedOfficeFormat],
  );

  const preview =
    artifact == null ? "" : truncateJson(JSON.stringify(artifact.proto, null, 2));
  const labels: PreviewLabels = {
    visualPreview: t.debug.officeWasmPocVisualPreview,
    rawJson: t.debug.officeWasmPocRawJson,
    sheet: t.debug.officeWasmPocSheet,
    slide: t.debug.officeWasmPocSlide,
    noSheets: t.debug.officeWasmPocNoSheets,
    noSlides: t.debug.officeWasmPocNoSlides,
    noDocumentBlocks: t.debug.officeWasmPocNoDocumentBlocks,
    showingFirstRows: t.debug.officeWasmPocShowingFirstRows,
    shapes: t.debug.officeWasmPocShapes,
    textRuns: t.debug.officeWasmPocTextRuns,
  };

  return (
    <main
      style={{
        boxSizing: "border-box",
        display: "grid",
        fontFamily: "Arial, sans-serif",
        gap: 16,
        height: "100vh",
        maxWidth: "none",
        minHeight: "100vh",
        overflowY: "auto",
        padding: 24,
        width: "100%",
      }}
    >
      <header
        style={{
          alignItems: "center",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: 12,
        }}
      >
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span style={{ color: "#475569", fontSize: 13 }}>{t.debug.officeWasmPocSelectFile}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.docx,.pptx,.xlsx"
            onChange={parseFile}
            disabled={isBusy}
          />
        </label>
        <div style={{ color: "#475569", fontSize: 13 }}>
          <strong>{t.debug.officeWasmPocStatus}</strong> {statusLabel(t, status)}
        </div>
        {selectedFileName ? (
          <div style={{ color: "#475569", fontSize: 13 }}>
            <code>{selectedFileName}</code>
            {lastBytes !== null ? <> ({lastBytes} {t.debug.officeWasmPocBytes})</> : null}
          </div>
        ) : null}
        {errorMessage ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{errorMessage}</div> : null}
      </header>

      <section>
        {artifact ? (
          <div style={{ display: "grid", gap: 12 }}>
            <section data-testid="office-preview">
              <OfficePreview artifact={artifact} labels={labels} />
            </section>
            <details style={{ marginTop: 18 }}>
              <summary style={{ cursor: "pointer" }}>{labels.rawJson}</summary>
              <pre style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "420px",
                overflow: "auto",
                background: "#0b1020",
                color: "#f8fafc",
                padding: 12,
                borderRadius: 8,
              }}>
                {preview}
              </pre>
            </details>
          </div>
        ) : (
          <p>{t.debug.officeWasmPocNoResult}</p>
        )}
      </section>
    </main>
  );
}
