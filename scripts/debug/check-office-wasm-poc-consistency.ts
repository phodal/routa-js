import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

const {
  OFFICE_WASM_ARTIFACT_TAB_BUNDLE,
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
  OFFICE_WASM_PANEL_CONTRACT,
  OFFICE_WASM_READER_ABI,
  OFFICE_WASM_READER_MODULES,
  OFFICE_WASM_TMP_ASSET_DIR,
} = officeWasmConfig;

const repoRoot = process.cwd();
const assetDir = path.resolve(repoRoot, OFFICE_WASM_TMP_ASSET_DIR);
const artifactBundlePath = path.join(assetDir, OFFICE_WASM_ARTIFACT_TAB_BUNDLE);
const pageClientPath = path.resolve(
  repoRoot,
  "src/app/debug/office-wasm-poc/page-client.tsx",
);

const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

function assertFileExists(fileName: string) {
  const filePath = path.join(assetDir, fileName);
  if (!existsSync(filePath)) {
    fail(`Missing extracted asset: ${fileName}`);
  }
}

function assertIncludes(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) {
    fail(`Missing ${label}: ${needle}`);
  }
}

function resourceHashGroups(): Array<Record<string, string>> {
  const resources = OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources;
  return [
    resources.coreAssembly,
    resources.assembly,
    resources.jsModuleNative,
    resources.jsModuleRuntime,
    resources.wasmNative,
  ];
}

for (const fileName of Object.values(OFFICE_WASM_READER_MODULES)) {
  assertFileExists(fileName);
}

for (const fileName of Object.keys(OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources.fingerprinting)) {
  assertFileExists(fileName);
}

for (const group of resourceHashGroups()) {
  for (const fileName of Object.keys(group)) {
    assertFileExists(fileName);
  }
}

assertFileExists(OFFICE_WASM_ARTIFACT_TAB_BUNDLE);

const artifactBundle = existsSync(artifactBundlePath)
  ? readFileSync(artifactBundlePath, "utf8")
  : "";
const pageClient = existsSync(pageClientPath)
  ? readFileSync(pageClientPath, "utf8")
  : "";

assertIncludes(
  artifactBundle,
  "mainAssemblyName:`Walnut`",
  "Walnut main assembly in extracted artifact bundle",
);
assertIncludes(
  artifactBundle,
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources.hash,
  "runtime resource hash in extracted artifact bundle",
);

for (const [fileName, logicalName] of Object.entries(
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources.fingerprinting,
)) {
  assertIncludes(
    artifactBundle,
    `"${fileName}":\`${logicalName}\``,
    `fingerprint mapping for ${fileName}`,
  );
}

for (const group of resourceHashGroups()) {
  for (const [fileName, hash] of Object.entries(group)) {
    assertIncludes(
      artifactBundle,
      `"${fileName}":\`${hash}\``,
      `resource hash for ${fileName}`,
    );
  }
}

for (const [moduleKind, fileName] of Object.entries(OFFICE_WASM_READER_MODULES)) {
  if (moduleKind === "dotnet") {
    continue;
  }

  assertIncludes(
    artifactBundle,
    `./${fileName}`,
    `reader module reference for ${fileName}`,
  );
}

for (const abi of OFFICE_WASM_READER_ABI) {
  assertIncludes(artifactBundle, abi, `reader ABI ${abi}`);
}

for (const panelName of OFFICE_WASM_PANEL_CONTRACT) {
  assertIncludes(artifactBundle, panelName, `panel contract ${panelName}`);
}

for (const testId of [
  "spreadsheet-preview",
  "presentation-preview",
  "document-preview",
]) {
  assertIncludes(pageClient, `data-testid="${testId}"`, `POC renderer ${testId}`);
}

if (failures.length > 0) {
  console.error("Office WASM POC consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Office WASM POC consistency check passed (${assetDir})`,
);
