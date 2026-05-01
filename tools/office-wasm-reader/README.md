# Routa Office WASM Reader

This is the Routa-owned proof-of-concept for the Office artifact reader described in `docs/issues/2026-05-01-office-document-viewer-wasm-reader.md`.

The project mirrors the Codex/Walnut runtime shape without depending on the extracted Walnut binaries:

```text
Office bytes
  -> .NET browser-wasm reader exports
  -> Routa OfficeArtifact protobuf bytes
  -> TypeScript protocol decoder
  -> Routa artifact viewer
```

## Matched Dependencies

The dependency versions are pinned to the versions observed in the extracted Codex/Walnut bundle:

- `.NET browser-wasm runtime`: `9.0.14`
- `DocumentFormat.OpenXml`: `3.3.0`
- `DocumentFormat.OpenXml.Framework`: `3.3.0`
- `Google.Protobuf`: `3.31.0`
- `System.IO.Packaging`: `8.0.1`

Keep these versions pinned while validating compatibility. Do not swap the reader onto unrelated JS ZIP/XML parsers; the point of this POC is to exercise the same OpenXML SDK and protobuf runtime family as the extracted bundle.

Versions are centralized in `Directory.Packages.props`, and the project enables NuGet lock-file restore. The `System.*` assemblies observed in the extracted bundle are runtime/BCL assemblies from the pinned `Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14` pack, not separate NuGet package references.

See `DEPENDENCIES.md` for the evidence table and the reason each package is pinned.

## Requirements

- .NET 9 SDK
- browser-wasm workload:

```bash
dotnet workload install wasm-tools
```

## Build

From the repository root:

```bash
npm run build:office-wasm-reader
```

The build script publishes `tools/office-wasm-reader/Routa.OfficeWasmReader` and copies the generated browser bundle to:

```text
public/office-wasm-reader/
```

That output is generated build material. Do not commit it until the reader asset shipping policy is decided.

## Reader ABI

The exported JS shape is intentionally close to Walnut:

```ts
exports.DocxReader.ExtractDocxProto(bytes, false);
exports.PptxReader.ExtractSlidesProto(bytes, false);
exports.XlsxReader.ExtractXlsxProto(bytes, false);
```

Each method accepts Office file bytes and returns protobuf bytes for `routa.office.v1.OfficeArtifact`.
