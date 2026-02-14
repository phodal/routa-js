/**
 * Test MCP Configuration
 */

import { ensureMcpForProvider, providerSupportsMcp } from "@/core/acp/mcp-setup";
import { getDefaultRoutaMcpConfig } from "@/core/acp/mcp-config-generator";

export function testMcpSetup() {
  console.log("Testing MCP Configuration\n");
  console.log("=".repeat(60));

  const providers = ["auggie", "opencode", "claude", "codex", "gemini", "kimi"];

  for (const providerId of providers) {
    console.log(`\nProvider: ${providerId}`);
    console.log("-".repeat(60));

    const supportsMcp = providerSupportsMcp(providerId);
    console.log(`Supports MCP: ${supportsMcp}`);

    if (supportsMcp) {
      const result = ensureMcpForProvider(providerId);
      console.log(`Summary: ${result.summary}`);
      console.log(`CLI args count: ${result.mcpConfigs.length}`);
      if (result.mcpConfigs.length > 0) {
        console.log(`CLI arg[0]: ${result.mcpConfigs[0].slice(0, 200)}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\nDefault MCP Config:");
  const defaultConfig = getDefaultRoutaMcpConfig();
  console.log(JSON.stringify(defaultConfig, null, 2));
}
