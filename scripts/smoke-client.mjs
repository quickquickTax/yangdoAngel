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
  const toolNames = tools.tools.map((tool) => tool.name);
  console.log("TOOLS", toolNames);
  const expectedTools = [
    "normalize_asset_input",
    "normalize_acquisition_method_input",
    "normalize_boolean_input",
    "normalize_duration_input",
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
    throw new Error(`Expected ${expectedTools.length} tools, got ${toolNames.length}.`);
  }
  for (const expectedTool of expectedTools) {
    if (!toolNames.includes(expectedTool)) {
      throw new Error(`Missing expected tool ${expectedTool}.`);
    }
  }
  const requiredDescriptionText = {
    normalize_asset_input: "자산 종류",
    normalize_acquisition_method_input: "취득 방법",
    normalize_boolean_input: "예/아니오",
    normalize_duration_input: "거주기간",
    normalize_ownership_input: "소유 형태",
    normalize_expense_input: "필요경비",
    normalize_date_input: "날짜 표현",
    normalize_amount_input: "금액 표현",
    prepare_capital_gains_case_checklist: "누락값",
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
    throw new Error("The start prompt is missing.");
  }
  const promptResult = await client.getPrompt({ name: startPrompt.name });
  const promptText = promptResult.messages
    .map((message) =>
      message.content.type === "text" ? message.content.text : ""
    )
    .join("\n");
  if (
    !promptText.includes("양도가액") ||
    !promptText.includes("normalize_date_input") ||
    !promptText.includes("normalize_amount_input") ||
    !promptText.includes("정규화 도구") ||
    !promptText.includes("개인정보")
  ) {
    throw new Error("The start prompt does not match the manual-input flow.");
  }

  const asset = await client.callTool({
    name: "normalize_asset_input",
    arguments: { rawAsset: "아파트" }
  });
  if (asset.structuredContent?.result?.assetSubType !== "housing") {
    throw new Error("Asset normalization failed.");
  }

  const acquisitionMethod = await client.callTool({
    name: "normalize_acquisition_method_input",
    arguments: { rawMethod: "샀어요" }
  });
  if (acquisitionMethod.structuredContent?.result?.method !== "purchase") {
    throw new Error("Acquisition method normalization failed.");
  }

  const booleanAnswer = await client.callTool({
    name: "normalize_boolean_input",
    arguments: { rawValue: "아니요" }
  });
  if (booleanAnswer.structuredContent?.result?.value !== false) {
    throw new Error("Boolean normalization failed.");
  }

  const duration = await client.callTool({
    name: "normalize_duration_input",
    arguments: { rawDuration: "2년 6개월" }
  });
  if (duration.structuredContent?.result?.residenceYears !== 2) {
    throw new Error("Duration normalization failed.");
  }

  const ownership = await client.callTool({
    name: "normalize_ownership_input",
    arguments: { rawOwnership: "저 60 배우자 40 공동명의" }
  });
  if (ownership.structuredContent?.result?.ownership?.owners?.[0]?.sharePercent !== 60) {
    throw new Error("Ownership normalization failed.");
  }

  const expense = await client.callTool({
    name: "normalize_expense_input",
    arguments: { rawExpense: "취득세 1200만원 증빙 있음" }
  });
  if (expense.structuredContent?.result?.expense?.amount !== 12000000) {
    throw new Error("Expense normalization failed.");
  }

  const date = await client.callTool({
    name: "normalize_date_input",
    arguments: { rawDate: "250101-260101" }
  });
  const normalizedStartDate = date.structuredContent?.result?.startDate;
  const normalizedEndDate = date.structuredContent?.result?.endDate;
  if (normalizedStartDate !== "2025-01-01" || normalizedEndDate !== "2026-01-01") {
    throw new Error(
      `Expected normalized date range 2025-01-01~2026-01-01, got ${normalizedStartDate}~${normalizedEndDate}.`
    );
  }

  const amount = await client.callTool({
    name: "normalize_amount_input",
    arguments: { rawAmount: "7억 5천만" }
  });
  const normalizedAmount = amount.structuredContent?.result?.amount;
  if (normalizedAmount !== 750000000) {
    throw new Error(`Expected normalized amount 750000000, got ${normalizedAmount}.`);
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
