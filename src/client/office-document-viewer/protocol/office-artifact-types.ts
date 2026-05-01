export type OfficeArtifactKind = "csv" | "tsv" | "docx" | "pptx" | "xlsx";

export type OfficeWasmArtifactKind = Extract<OfficeArtifactKind, "docx" | "pptx" | "xlsx">;

export interface RoutaOfficeTextBlock {
  path: string;
  text: string;
}

export interface RoutaOfficeCell {
  address: string;
  text: string;
  formula: string;
}

export interface RoutaOfficeRow {
  cells: RoutaOfficeCell[];
}

export interface RoutaOfficeSheet {
  name: string;
  rows: RoutaOfficeRow[];
}

export interface RoutaOfficeTable {
  path: string;
  rows: RoutaOfficeRow[];
}

export interface RoutaOfficeSlide {
  index: number;
  title: string;
  textBlocks: RoutaOfficeTextBlock[];
}

export interface RoutaOfficeDiagnostic {
  level: string;
  message: string;
}

export interface RoutaOfficeImageAsset {
  id: string;
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface RoutaOfficeArtifact {
  sourceKind: string;
  title: string;
  textBlocks: RoutaOfficeTextBlock[];
  sheets: RoutaOfficeSheet[];
  slides: RoutaOfficeSlide[];
  diagnostics: RoutaOfficeDiagnostic[];
  metadata: Record<string, string>;
  images: RoutaOfficeImageAsset[];
  tables: RoutaOfficeTable[];
}

export function emptyRoutaOfficeArtifact(): RoutaOfficeArtifact {
  return {
    diagnostics: [],
    images: [],
    metadata: {},
    sheets: [],
    slides: [],
    sourceKind: "",
    tables: [],
    textBlocks: [],
    title: "",
  };
}
