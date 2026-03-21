import { startAcpRunnerServer } from "@/core/acp/runner-http-server";

startAcpRunnerServer().catch((error) => {
  console.error("[ACP Runner] Failed to start:", error);
  process.exitCode = 1;
});
