import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  CalculationToolInputSchema,
  ValidationToolInputSchema
} from "./tools/schemas.js";
import { runValidation } from "./tools/validate-capital-gains-case.js";
import { runCalculation } from "./tools/calculate-capital-gains-tax.js";
import { getSupportedScenarios } from "./tools/list-supported-scenarios.js";
import { sanitizePersonalInfo } from "./tools/sanitize-personal-info.js";
import { extractContractCaseFields } from "./tools/extract-contract-case-fields.js";
import { prepareCapitalGainsCaseChecklist } from "./tools/prepare-capital-gains-case-checklist.js";

export const SERVICE_DISPLAY_NAME = "바로바로 양도소득세";

export const INITIAL_CONTRACT_REQUEST =
  "양도소득세 검토를 시작하려면 양도계약서와 취득계약서 사진을 올려달라고 안내하세요. " +
  "사진은 계약일, 거래금액, 부동산 종류를 확인할 수 있도록 선명해야 합니다. " +
  "사진을 올리면 시스템이 주민등록번호·이름·전화번호·계좌번호를 자동으로 마스킹합니다. " +
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
        `${INITIAL_CONTRACT_REQUEST} ` +
        `계약서 사진에서 텍스트를 읽었으면 반드시 sanitize_contract_text 도구를 가장 먼저 호출하여 개인정보를 마스킹하세요. ` +
        `마스킹된 결과만 extract_contract_case_fields와 prepare_capital_gains_case_checklist에 전달하고, 원본 개인정보(주민등록번호·이름 등)는 절대 출력하거나 도구 인자로 사용하지 마세요. ` +
        `계산 전에는 prepare_capital_gains_case_checklist와 validate_capital_gains_case를 사용해 누락값과 지원 범위를 확인하세요. ` +
        `Do not calculate until missing values and document evidence have been validated.`
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
    "sanitize_contract_text",
    {
      title: "계약서 개인정보 마스킹",
      description:
        `${SERVICE_DISPLAY_NAME}는 계약서 사진에서 추출한 텍스트의 주민(외국인)등록번호, 이름, 전화번호, 계좌번호를 자동으로 마스킹합니다. ` +
        `계약서 이미지를 분석할 때 반드시 다른 도구보다 먼저 호출하세요. ` +
        `마스킹된 텍스트(sanitizedText)만 이후 검증·계산 도구에 사용하세요.`,
      annotations: readOnlyAnnotations("Sanitize Personal Information from Contract Text"),
      inputSchema: {
        contractText: z
          .string()
          .min(1)
          .describe("계약서 사진에서 OCR로 추출한 원문 텍스트")
      }
    },
    async ({ contractText }) => {
      const result = sanitizePersonalInfo(contractText);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "extract_contract_case_fields",
    {
      title: "계약서 계산 입력값 추출",
      description:
        `${SERVICE_DISPLAY_NAME}는 sanitize_contract_text로 마스킹된 계약서 OCR 텍스트에서 양도일, 취득일, 양도가액, 취득가액, 자산 종류 등 계산 후보값을 추출합니다. ` +
        `반환되는 partialCaseData는 validate_capital_gains_case의 caseData와 호환됩니다. ` +
        `계약서 원문이 아니라 마스킹된 텍스트만 입력하세요.`,
      annotations: readOnlyAnnotations("Extract Contract Fields for Capital Gains Case"),
      inputSchema: {
        sanitizedContractText: z
          .string()
          .min(1)
          .describe("sanitize_contract_text가 반환한 마스킹된 계약서 OCR 텍스트"),
        documentType: z
          .enum(["transfer", "acquisition", "unknown"])
          .default("unknown")
          .describe("텍스트가 양도계약서인지 취득계약서인지 알 수 없으면 unknown")
      }
    },
    async ({ sanitizedContractText, documentType }) => {
      const result = extractContractCaseFields(
        sanitizedContractText,
        documentType
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "prepare_capital_gains_case_checklist",
    {
      title: "계산 전 체크리스트 생성",
      description:
        `${SERVICE_DISPLAY_NAME}는 계약서에서 추출한 partialCaseData 또는 사용자가 입력한 caseData를 기준으로 누락값, 1세대 1주택, 조정대상지역, 공동명의, 취득 방법, 동일연도 양도, 필요경비 증빙 체크리스트를 생성합니다. ` +
        `반환된 질문에 답을 채운 뒤 validate_capital_gains_case를 호출하세요. ` +
        `값을 임의로 추정하지 않고 기존 계산 도구의 입력 구조와 호환되는 필드명을 사용합니다.`,
      annotations: readOnlyAnnotations("Prepare Pre-calculation Checklist"),
      inputSchema: {
        caseData: z
          .record(z.string(), z.unknown())
          .describe("계약서 추출값과 사용자 답변을 누적한 양도소득세 사건 데이터")
      }
    },
    async ({ caseData }) => {
      const result = prepareCapitalGainsCaseChecklist(caseData);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "validate_capital_gains_case",
    {
      title: "양도소득세 사건 입력 검증",
      description:
        `${SERVICE_DISPLAY_NAME}는 계산 전에 필수 입력값, 날짜, 소유 지분, 적용 세법 기준과 지원 범위를 검증합니다. 상담을 시작할 때 주민등록번호, 계좌번호, 서명과 도장을 가린 양도계약서 및 취득계약서 사진을 요청합니다. 다른 계산 도구보다 먼저 호출하며 누락된 값을 임의로 추정하지 않습니다.`,
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
        `${SERVICE_DISPLAY_NAME}는 검증이 완료된 부동산 양도 사건을 바탕으로 양도소득세와 개인지방소득세 예상액을 계산합니다. 같은 해 복수 양도나 상속·증여 취득 등 현재 지원하지 않는 사건은 계산하지 않습니다. 결과는 검토용 예상屡이며 확정 신고세액이 아닙니다.`,
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
        `${SERVICE_DISPLAY_NAME}가 지원하는 세법 기준일, 계산 가능한 사건, 미지원 사건과 주요 이용 주의사항을 안내합니다. 사건의 지원 여부가 불확실하면 상세 정보를 수집하기 전에 이 도구를 먼저 사용합니다.`,
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
