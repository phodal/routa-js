import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const projectPath = path.join(
  repoRoot,
  "tools/office-wasm-reader/Routa.OfficeWasmReader/Routa.OfficeWasmReader.csproj",
);
const artifactRoot = path.join(repoRoot, "tools/office-wasm-reader/artifacts");
const publishDir = path.join(artifactRoot, "publish");
const publicDir = path.join(repoRoot, "public/office-wasm-reader");
const dotnetCommand =
  process.env.DOTNET ??
  (existsSync("/opt/homebrew/opt/dotnet@9/libexec/dotnet")
    ? "/opt/homebrew/opt/dotnet@9/libexec/dotnet"
    : "dotnet");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.error?.code === "ENOENT") {
    throw new Error(
      "`dotnet` was not found. Install .NET 9 SDK and run `dotnet workload install wasm-tools`.",
    );
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

rmSync(publishDir, { force: true, recursive: true });
run(dotnetCommand, ["publish", projectPath, "-c", "Release", "-o", publishDir]);

const candidateRoots = [
  path.join(publishDir, "wwwroot"),
  path.join(publishDir, "AppBundle"),
  publishDir,
];
const bundleRoot = candidateRoots.find((candidate) => existsSync(path.join(candidate, "_framework")));

if (!bundleRoot) {
  throw new Error(`Could not find a published browser-wasm _framework directory under ${publishDir}`);
}

rmSync(publicDir, { force: true, recursive: true });
cpSync(bundleRoot, publicDir, { recursive: true });

console.log(`Published Office WASM reader to ${publicDir}`);
