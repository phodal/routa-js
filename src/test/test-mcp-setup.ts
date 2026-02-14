/**
 * Test MCP Configuration
 */

import { setupMcpForProvider, providerSupportsMcp, type McpSupportedProvider } from "@/core/acp/mcp-setup";
import { getDefaultRoutaMcpConfig, generateRoutaMcpConfigJson } from "@/core/acp/mcp-config-generator";

export function testMcpSetup() {
  console.log("Testing MCP Configuration\n");
  console.log("=" .repeat(60));

  const providers: McpSupportedProvider[] = ["auggie", "codex", "opencode", "gemini"];

  for (const providerId of providers) {
    console.log(`\nProvider: ${providerId}`);
    console.log("-".repeat(60));

    const supportsMcp = providerSupportsMcp(providerId);
    console.log(`Supports MCP: ${supportsMcp}`);

    if (supportsMcp) {
      const mcpConfigs = setupMcpForProvider(providerId);
      console.log(`MCP Config Count: ${mcpConfigs.length}`);
      
      if (mcpConfigs.length > 0) {
        console.log(`MCP Config JSON:\n${mcpConfigs[0]}`);
        
        try {
          const parsed = JSON.parse(mcpConfigs[0]);
          console.log(`\nParsed Config:`);
          console.log(`  - Name: ${parsed.name}`);
          console.log(`  - Type: ${parsed.type}`);
          console.log(`  - URL: ${parsed.url}`);
          if (parsed.env) {
            console.log(`  - Env: ${JSON.stringify(parsed.env)}`);
          }
        } catch (e) {
          console.error(`  ERROR: Invalid JSON - ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\nDefault MCP Config:");
  const defaultConfig = getDefaultRoutaMcpConfig();
  console.log(JSON.stringify(defaultConfig, null, 2));
  
  console.log("\nGenerated JSON:");
  console.log(generateRoutaMcpConfigJson(defaultConfig));
}
