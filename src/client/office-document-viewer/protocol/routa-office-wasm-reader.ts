import { decodeRoutaOfficeArtifact } from "./office-artifact-protobuf";
import type { OfficeWasmArtifactKind, RoutaOfficeArtifact } from "./office-artifact-types";

export const ROUTA_OFFICE_WASM_ASSET_BASE_URL = "/office-wasm-reader";
export const ROUTA_OFFICE_WASM_MAIN_ASSEMBLY = "Routa.OfficeWasmReader";

export interface RoutaOfficeWasmReaderExports {
  DocxReader: {
    ExtractDocxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
  PptxReader: {
    ExtractSlidesProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
  XlsxReader: {
    ExtractXlsxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
  ReaderInfo?: {
    GetReaderVersion: () => string;
  };
}

export interface LoadRoutaOfficeWasmReaderOptions {
  assetBaseUrl?: string;
}

interface DotnetRuntime {
  getAssemblyExports: (assemblyName: string) => Promise<RoutaOfficeWasmReaderExports>;
  getConfig: () => { mainAssemblyName?: string };
}

interface DotnetBuilder {
  withResourceLoader: (
    loader: (resourceType: string, name: string, defaultUri: string, integrity: string) => string | Promise<Response>,
  ) => DotnetBuilder;
  create: () => Promise<DotnetRuntime>;
}

interface DotnetModule {
  dotnet: DotnetBuilder;
}

let cachedReader: Promise<RoutaOfficeWasmReaderExports> | null = null;

export async function loadRoutaOfficeWasmReader(
  options: LoadRoutaOfficeWasmReaderOptions = {},
): Promise<RoutaOfficeWasmReaderExports> {
  if (!cachedReader) {
    cachedReader = createRoutaOfficeWasmReader(options).catch((error: unknown) => {
      cachedReader = null;
      throw error;
    });
  }

  return cachedReader;
}

export function resetRoutaOfficeWasmReaderCache(): void {
  cachedReader = null;
}

export function extractOfficeArtifactProto(
  reader: RoutaOfficeWasmReaderExports,
  bytes: Uint8Array,
  kind: OfficeWasmArtifactKind,
  ignoreErrors = false,
): Uint8Array {
  if (kind === "docx") {
    return toUint8Array(reader.DocxReader.ExtractDocxProto(bytes, ignoreErrors));
  }

  if (kind === "pptx") {
    return toUint8Array(reader.PptxReader.ExtractSlidesProto(bytes, ignoreErrors));
  }

  return toUint8Array(reader.XlsxReader.ExtractXlsxProto(bytes, ignoreErrors));
}

export async function parseOfficeArtifactWithWasm(
  reader: RoutaOfficeWasmReaderExports,
  bytes: Uint8Array,
  kind: OfficeWasmArtifactKind,
  ignoreErrors = false,
): Promise<RoutaOfficeArtifact> {
  return decodeRoutaOfficeArtifact(extractOfficeArtifactProto(reader, bytes, kind, ignoreErrors));
}

async function createRoutaOfficeWasmReader(
  options: LoadRoutaOfficeWasmReaderOptions,
): Promise<RoutaOfficeWasmReaderExports> {
  const assetBaseUrl = stripTrailingSlash(options.assetBaseUrl ?? ROUTA_OFFICE_WASM_ASSET_BASE_URL);
  const dotnetModule = (await import(
    /* webpackIgnore: true */ `${assetBaseUrl}/_framework/dotnet.js`
  )) as DotnetModule;

  const runtime = await dotnetModule.dotnet
    .withResourceLoader((resourceType, _name, defaultUri, integrity) => {
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

  return runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName ?? ROUTA_OFFICE_WASM_MAIN_ASSEMBLY);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toUint8Array(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value);
}
