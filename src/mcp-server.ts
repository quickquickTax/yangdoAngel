import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  CalculationToolInputSchema,
  ValidationToolInputSchema
} from "./tools/schemas.js";
import { runValidation } from "./tools/validate-capital-gains-case.js";
import { runCalculation } from "./tools/calculate-capital-gains-tax.js";
import { getSupportedScenarios } from "./tools/list-supported-scenarios.js";

export const SERVICE_DISPLAY_NAME =
  "Korean Capital Gains Tax Advisor(한국 양도소득세 도우미)";

function readOnlyAnnotations(title: string) {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true
  };
}

export function createCapitalGainsMcpServer(): McpServer {
  const server = new McpServer({
    name: "kr-capital-gains-tax",
    version: "0.1.0"
  });

  server.registerTool(
    "validate_capital_gains_case",
    {
      title: "양도소득세 사건 입력 검증",
      description:
        `${SERVICE_DISPLAY_NAME} validates required fields, dates, ownership shares, rule applicability, and supported scenarios before calculating Korean real-estate capital gains tax. Call this tool first and do not infer missing values.`,
      annotations: readOnlyAnnotations(
        "Validate a Korean Capital Gains Tax Case"
      ),
      inputSchema: ValidationToolInputSchema
    },
    async ({ caseData }) => {
      const result = runValidation(caseData);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "calculate_capital_gains_tax",
    {
      title: "양도소득세 예상 계산",
      description:
        `${SERVICE_DISPLAY_NAME} deterministically estimates Korean real-estate capital gains tax and local income tax from a complete, validated case. It rejects unsupported cases such as multiple transfers in one tax year or acquisition by inheritance or gift. Results are estimates for review, not final filing amounts.`,
      annotations: readOnlyAnnotations(
        "Calculate Estimated Korean Capital Gains Tax"
      ),
      inputSchema: CalculationToolInputSchema
    },
    async ({ caseData }) => {
      try {
        const result = runCalculation(caseData);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: { result }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: message }]
        };
      }
    }
  );

  server.registerTool(
    "list_supported_capital_gains_scenarios",
    {
      title: "지원 범위 확인",
      description:
        `${SERVICE_DISPLAY_NAME} lists supported rule dates, scenarios that can be calculated, unsupported cases, and important usage cautions. Use this tool before collecting case details when support is uncertain.`,
      annotations: readOnlyAnnotations(
        "List Supported Korean Capital Gains Tax Scenarios"
      ),
      inputSchema: {
        detailLevel: z.enum(["summary", "full"]).default("full")
      }
    },
    async ({ detailLevel }) => {
      const result = getSupportedScenarios();
      const output =
        detailLevel === "summary"
          ? {
              serverVersion: result.serverVersion,
              supportedRuleDates: result.supportedRuleDates,
              caution: result.caution
            }
          : result;
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: { result: output }
      };
    }
  );

  return server;
}
