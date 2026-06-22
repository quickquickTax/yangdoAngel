#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCapitalGainsMcpServer } from "./mcp-server.js";

async function main(): Promise<void> {
  const server = createCapitalGainsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("kr-capital-gains-tax MCP server 0.1.0 running on stdio");
}

main().catch((error: unknown) => {
  console.error("MCP server fatal error:", error);
  process.exit(1);
});
