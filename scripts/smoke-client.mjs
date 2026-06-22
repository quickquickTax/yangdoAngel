import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(cwd, "dist/server.js")],
  cwd,
  stderr: "pipe"
});

if (transport.stderr) {
  transport.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

const client = new Client(
  { name: "capital-gains-tax-smoke-client", version: "0.1.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("TOOLS", tools.tools.map((tool) => tool.name));
  const requiredDescriptionText = {
    validate_capital_gains_case: "필수 입력값",
    calculate_capital_gains_tax: "예상액",
    list_supported_capital_gains_scenarios: "지원하는 세법 기준일"
  };
  for (const tool of tools.tools) {
    if (!tool.description?.includes("바로바로 양도소득세")) {
      throw new Error(
        `Tool ${tool.name} is missing the service name 바로바로 양도소득세.`
      );
    }
    const requiredText = requiredDescriptionText[tool.name];
    if (!requiredText || !tool.description.includes(requiredText)) {
      throw new Error(`Tool ${tool.name} is missing its Korean description.`);
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

  const prompts = await client.listPrompts();
  const startPrompt = prompts.prompts.find(
    (prompt) => prompt.name === "start_capital_gains_tax_review"
  );
  if (!startPrompt) {
    throw new Error("The contract-photo start prompt is missing.");
  }
  const promptResult = await client.getPrompt({ name: startPrompt.name });
  const promptText = promptResult.messages
    .map((message) =>
      message.content.type === "text" ? message.content.text : ""
    )
    .join("\n");
  if (!promptText.includes("양도계약서") || !promptText.includes("주민등록번호")) {
    throw new Error("The start prompt is missing contract or privacy guidance.");
  }

  const validation = await client.callTool({
    name: "validate_capital_gains_case",
    arguments: {
      caseData: {
        ruleDate: "2026-04-21",
        asset: { subType: "housing", domestic: true, registered: true },
        transfer: { date: "2026-06-01", price: 600000000 },
        acquisition: {
          date: "2018-01-01",
          price: 300000000,
          method: "purchase"
        },
        expenses: [
          {
            type: "capital_expenditure",
            amount: 20000000,
            evidenceStatus: "available"
          }
        ],
        ownership: { type: "solo" },
        household: {
          houseCount: 1,
          residenceYears: 0,
          isAdjustedArea: false,
          oneHouseExemptionClaimed: false,
          exemptionVerificationStatus: "not_eligible"
        },
        annualContext: { otherTransfersExist: false }
      }
    }
  });
  console.log("VALIDATION", validation.structuredContent ?? validation.content);

  const calculation = await client.callTool({
    name: "calculate_capital_gains_tax",
    arguments: {
      caseData: {
        ruleDate: "2026-04-21",
        asset: { subType: "housing", domestic: true, registered: true },
        transfer: { date: "2026-06-01", price: 600000000 },
        acquisition: {
          date: "2018-01-01",
          price: 300000000,
          method: "purchase"
        },
        expenses: [
          {
            type: "capital_expenditure",
            amount: 20000000,
            evidenceStatus: "available"
          }
        ],
        ownership: { type: "solo", basicDeductionAlreadyUsed: 0 },
        household: {
          houseCount: 1,
          residenceYears: 0,
          isAdjustedArea: false,
          oneHouseExemptionClaimed: false,
          exemptionVerificationStatus: "not_eligible"
        },
        annualContext: { otherTransfersExist: false }
      }
    }
  });
  const result = calculation.structuredContent?.result;
  console.log("TOTAL_TAX", result?.totalTax);
} finally {
  await client.close();
}
