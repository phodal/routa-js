import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const packagesProps = path.join(repoRoot, "tools/office-wasm-reader/Directory.Packages.props");
const extractedAssets = path.join(repoRoot, "tmp/codex-app-analysis/extracted/webview/assets");

const expectedVersions = {
  "DocumentFormat.OpenXml": "3.3.0",
  "DocumentFormat.OpenXml.Framework": "3.3.0",
  "Google.Protobuf": "3.31.0",
  "Microsoft.NET.Runtime.WebAssembly.Sdk": "9.0.14",
  "System.IO.Packaging": "8.0.1",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function readBinaryAsLatin1(filePath) {
  return readFileSync(filePath).toString("latin1");
}

const props = readText(packagesProps);
for (const [name, version] of Object.entries(expectedVersions)) {
  assert(
    props.includes(`Include="${name}" Version="${version}"`),
    `${packagesProps} must pin ${name} ${version}`,
  );
}

const dotnetNative = readBinaryAsLatin1(path.join(extractedAssets, "dotnet.native.wfd2lrj4w6.wasm"));
assert(
  dotnetNative.includes("Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14"),
  "Extracted dotnet.native.wasm should be from Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14",
);

const protobuf = readBinaryAsLatin1(path.join(extractedAssets, "Google.Protobuf.ze35jf5cfr.wasm"));
assert(protobuf.includes("3.31.0.0"), "Extracted Google.Protobuf.wasm should contain 3.31.0.0 evidence");

const packaging = readBinaryAsLatin1(path.join(extractedAssets, "System.IO.Packaging.ejb20qp7p2.wasm"));
assert(packaging.includes("System.IO.Packaging"), "Extracted System.IO.Packaging.wasm evidence is missing");
assert(packaging.includes("8.0.1024.46610"), "Extracted System.IO.Packaging.wasm version evidence changed");

for (const fileName of [
  "DocumentFormat.OpenXml.Framework.kpj7t3qucf.wasm",
  "DocumentFormat.OpenXml.ie8f746kzt.wasm",
]) {
  const content = readBinaryAsLatin1(path.join(extractedAssets, fileName));
  assert(content.includes("DocumentFormat.OpenXml"), `${fileName} should contain OpenXML evidence`);
}

console.log("Office WASM reader dependency pins match extracted bundle evidence.");
