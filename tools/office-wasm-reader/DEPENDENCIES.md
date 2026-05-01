# Office WASM Reader Dependency Lock

The reader intentionally matches the dependency families observed in the extracted Codex/Walnut webview bundle.

| Dependency | Pinned Version | Why |
| --- | --- | --- |
| `.NET browser-wasm runtime` | `9.0.14` | `dotnet.native.wfd2lrj4w6.wasm` contains `Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14`. |
| `DocumentFormat.OpenXml` | `3.3.0` | Extracted bundle contains `DocumentFormat.OpenXml.wasm`; NuGet package `DocumentFormat.OpenXml` `3.3.0` is the matching Open XML SDK release line. |
| `DocumentFormat.OpenXml.Framework` | `3.3.0` | Extracted bundle contains `DocumentFormat.OpenXml.Framework.wasm`; `DocumentFormat.OpenXml 3.3.0` depends on the same framework package line. |
| `System.IO.Packaging` | `8.0.1` | Extracted bundle contains `System.IO.Packaging.wasm`; `DocumentFormat.OpenXml.Framework 3.3.0` depends on `System.IO.Packaging >= 8.0.1`. |
| `Google.Protobuf` | `3.31.0` | Extracted `Google.Protobuf.wasm` contains assembly version evidence `3.31.0.0`. |
| `System.*` runtime assemblies | `9.0.14 runtime pack` | Extracted `System.*.wasm` assemblies are BCL/runtime assemblies from the browser-wasm runtime pack, not separate NuGet package references. |

Do not replace these with JS ZIP/XML parser packages when validating compatibility. The point of this POC is to exercise the same OpenXML SDK and .NET browser-wasm runtime surface as the extracted bundle while implementing Routa-owned reader code.

Version declarations live in `Directory.Packages.props`; the project enables NuGet lock-file restore so `dotnet restore` generates `packages.lock.json` once a .NET 9 SDK is available locally.
