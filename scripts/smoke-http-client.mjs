import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remoteMcpUrl = process.env.MCP_URL;
const authMode = process.argv.includes("--no-auth") ? "none" : "bearer";
const apiKey =
  process.env.MCP_API_KEY ?? "http-smoke-test-key-at-least-32-characters";

if (authMode === "bearer" && remoteMcpUrl && !process.env.MCP_API_KEY) {
  throw new Error("MCP_API_KEY is required when MCP_URL is provided.");
}

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => probe.close(resolveClose));
  if (!port) throw new Error("Could not allocate a test port.");
  return port;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`HTTP server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the HTTP server health endpoint.");
}

let child;
let mcpUrl;
let healthUrl;

if (remoteMcpUrl) {
  mcpUrl = new URL(remoteMcpUrl);
  healthUrl = new URL("/health", mcpUrl);
} else {
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  mcpUrl = new URL(`${baseUrl}/mcp`);
  healthUrl = new URL(`${baseUrl}/health`);
  child = spawn(process.execPath, [resolve(cwd, "dist/http-server.js")], {
    cwd,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      MCP_AUTH_MODE: authMode,
      ...(authMode === "bearer" ? { MCP_API_KEY: apiKey } : {}),
      ALLOWED_HOSTS: "127.0.0.1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
}

const client = new Client(
  { name: "capital-gains-tax-http-smoke-client", version: "0.1.0" },
  { capabilities: {} }
);

try {
  if (child) {
    await waitForHealth(healthUrl, child);
  } else {
    const health = await fetch(healthUrl);
    if (!health.ok) {
      throw new Error(`Remote health check failed with status ${health.status}.`);
    }
  }

  const unauthorized = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  if (authMode === "bearer" && unauthorized.status !== 401) {
    throw new Error(`Expected unauthenticated status 401, got ${unauthorized.status}.`);
  }
  if (authMode === "none" && unauthorized.status === 401) {
    throw new Error("No-auth server unexpectedly required authentication.");
  }

  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    ...(authMode === "bearer"
      ? {
          requestInit: {
            headers: { Authorization: `Bearer ${apiKey}` }
          }
        }
      : {})
  });
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  console.log("HTTP_TOOLS", toolNames);
  const expectedTools = [
    "normalize_case_input",
    "normalize_asset_input",
    "normalize_acquisition_method_input",
    "normalize_boolean_input",
    "normalize_duration_input",
    "normalize_count_input",
    "normalize_exemption_verification_input",
    "normalize_ownership_input",
    "normalize_expense_input",
    "normalize_date_input",
    "normalize_amount_input",
    "prepare_capital_gains_case_checklist",
    "validate_capital_gains_case",
    "calculate_capital_gains_tax",
    "list_supported_capital_gains_scenarios"
  ];
  if (toolNames.length !== expectedTools.length) {
    throw new Error(`Expected ${expectedTools.length} HTTP tools, got ${toolNames.length}.`);
  }
  for (const expectedTool of expectedTools) {
    if (!toolNames.includes(expectedTool)) {
      throw new Error(`Missing expected HTTP tool ${expectedTool}.`);
    }
  }
  for (const tool of tools.tools) {
    if (
      !tool.description?.includes("바로바로 양도소득세")
    ) {
      throw new Error(`Tool ${tool.name} is missing the service name.`);
    }
    const annotations = tool.annotations;
    if (
      !annotations?.title ||
      annotations.readOnlyHint !== true ||
      annotations.destructiveHint !== false ||
      annotations.openWorldHint !== false ||
      annotations.idempotentHint !== true
    ) {
      throw new Error(`Tool ${tool.name} has incomplete PlayMCP annotations.`);
    }
  }

  const caseInput = await client.callTool({
    name: "normalize_case_input",
    arguments: { targetField: "acquisition.date", rawValue: "250101" }
  });
  if (
    caseInput.structuredContent?.result?.normalizedValue !== "2025-01-01" ||
    caseInput.structuredContent?.result?.caseDataPatch?.acquisition?.date !==
      "2025-01-01"
  ) {
    throw new Error("HTTP unified case input normalization failed.");
  }

  const asset = await client.callTool({
    name: "normalize_asset_input",
    arguments: { rawAsset: "상가" }
  });
  if (asset.structuredContent?.result?.assetSubType !== "building") {
    throw new Error("HTTP asset normalization failed.");
  }

  const ownership = await client.callTool({
    name: "normalize_ownership_input",
    arguments: { rawOwnership: "부부 반반" }
  });
  if (ownership.structuredContent?.result?.ownership?.owners?.[1]?.sharePercent !== 50) {
    throw new Error("HTTP ownership normalization failed.");
  }

  const count = await client.callTool({
    name: "normalize_count_input",
    arguments: { rawCount: "두 채" }
  });
  if (count.structuredContent?.result?.count !== 2) {
    throw new Error("HTTP count normalization failed.");
  }

  const date = await client.callTool({
    name: "normalize_date_input",
    arguments: { rawDate: "20250101~20260101" }
  });
  const normalizedStartDate = date.structuredContent?.result?.startDate;
  const normalizedEndDate = date.structuredContent?.result?.endDate;
  if (normalizedStartDate !== "2025-01-01" || normalizedEndDate !== "2026-01-01") {
    throw new Error(
      `Expected HTTP normalized date range 2025-01-01~2026-01-01, got ${normalizedStartDate}~${normalizedEndDate}.`
    );
  }

  const amount = await client.callTool({
    name: "normalize_amount_input",
    arguments: { rawAmount: "7.5억" }
  });
  const normalizedAmount = amount.structuredContent?.result?.amount;
  if (normalizedAmount !== 750000000) {
    throw new Error(`Expected HTTP normalized amount 750000000, got ${normalizedAmount}.`);
  }

  const checklist = await client.callTool({
    name: "prepare_capital_gains_case_checklist",
    arguments: {
      caseData: {
        transfer: { date: "2026-06-01", price: 600000000 }
      }
    }
  });
  const questionGroups = checklist.structuredContent?.result?.questionGroups;
  if (
    !questionGroups?.some(
      (group) =>
        group.category === "transaction" &&
        group.questions?.some((question) => question.field === "acquisition.date")
    )
  ) {
    throw new Error("HTTP checklist question grouping failed.");
  }

  const supported = await client.callTool({
    name: "list_supported_capital_gains_scenarios",
    arguments: { detailLevel: "summary" }
  });
  console.log("HTTP_SUPPORTED", supported.structuredContent ?? supported.content);
} finally {
  await client.close().catch(() => undefined);
  if (child) {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (child.exitCode !== null) {
        resolveExit();
        return;
      }
      child.once("exit", resolveExit);
    });
  }
}
