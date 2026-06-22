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

export const INITIAL_CONTRACT_REQUEST =
  "양도소득세 검토를 시작하려면 양도계약서와 취득계약서 사진을 올려달라고 안내하세요. " +
  "사진은 계약일, 거래금액, 부동산 종류를 확인할 수 있도록 선명해야 합니다. " +
  "주민등록번호, 계좌번호, 서명과 도장은 반드시 가린 뒤 올리도록 안내하세요. " +
  "계약서가 없거나 사진을 올릴 수 없으면 필요한 정보를 질문으로 수집하세요.";

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
  const server = new McpServer(
    {
      name: "kr-capital-gains-tax",
      version: "0.1.0"
    },
    {
      instructions:
        `${INITIAL_CONTRACT_REQUEST} Do not calculate until missing values and document evidence have been validated.`
    }
  );

  server.registerPrompt(
    "start_capital_gains_tax_review",
    {
      title: "양도소득세 검토 시작",
      description:
        "계약서 사진을 안전하게 요청하고 양도소득세 검토를 시작합니다."
    },
    () => ({
      description: "양도소득세 검토 시작 안내",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: INITIAL_CONTRACT_REQUEST
          }
        }
      ]
    })
  );

  server.registerTool(
    "validate_capital_gains_case",
    {
      title: "양도소득세 사건 입력 검증",
      description:
        `${SERVICE_DISPLAY_NAME} validates required fields, dates, ownership shares, rule applicability, and supported scenarios before calculating Korean real-estate capital gains tax. At the beginning, request clear photos of the transfer and acquisition contracts with resident registration numbers, account numbers, signatures, and seals redacted. Call this tool first and do not infer missing values.`,
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
