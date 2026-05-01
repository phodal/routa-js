import { dotnet } from "./_framework/dotnet.js";

const { getAssemblyExports, getConfig, runMain } = await dotnet.create();
await runMain();

globalThis.RoutaOfficeWasmReader = {
  exports: await getAssemblyExports(getConfig().mainAssemblyName),
};
