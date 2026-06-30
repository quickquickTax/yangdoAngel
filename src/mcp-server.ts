import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  CalculationToolInputSchema,
  ValidationToolInputSchema
} from "./tools/schemas.js";
import { runValidation } from "./tools/validate-capital-gains-case.js";
import { runCalculation } from "./tools/calculate-capital-gains-tax.js";
import { getSupportedScenarios } from "./tools/list-supported-scenarios.js";
import { normalizeAcquisitionMethodInput } from "./tools/normalize-acquisition-method-input.js";
import { normalizeAmountInput } from "./tools/normalize-amount-input.js";
import { normalizeAssetInput } from "./tools/normalize-asset-input.js";
import { normalizeBooleanInput } from "./tools/normalize-boolean-input.js";
import { normalizeCountInput } from "./tools/normalize-count-input.js";
import { normalizeDateInput } from "./tools/normalize-date-input.js";
import { normalizeDurationInput } from "./tools/normalize-duration-input.js";
import { normalizeExemptionVerificationInput } from "./tools/normalize-exemption-verification-input.js";
import { normalizeExpenseInput } from "./tools/normalize-expense-input.js";
import { normalizeOwnershipInput } from "./tools/normalize-ownership-input.js";
import { prepareCapitalGainsCaseChecklist } from "./tools/prepare-capital-gains-case-checklist.js";

export const SERVICE_DISPLAY_NAME = "바로바로 양도소득세";

export const INITIAL_REVIEW_REQUEST =
  "양도소득세 검토를 시작하려면 개인정보 없이 계산에 필요한 정보를 질문으로 수집하세요. " +
  "필수 항목은 양도일, 양도가액, 취득일, 취득가액, 취득 방법, 자산 종류, 소유 형태, 세대 주택 수, 거주기간, 조정대상지역 여부, 1세대 1주택 비과세 요청 여부, 같은 과세연도 다른 양도 여부입니다. " +
  "금액을 7.5억, 7억5000만, 750,000,000처럼 답하면 normalize_amount_input으로 원 단위 숫자로 바꾸세요. " +
  "날짜를 2026.01.01, 260101, 20250101~20260101처럼 답하면 normalize_date_input으로 YYYY-MM-DD 형식으로 바꾸세요. " +
  "자산 종류, 취득 방법, 예/아니오, 주택 수, 거주기간, 비과세 검증 상태, 소유 형태, 필요경비 답변도 각 정규화 도구로 caseData 형식에 맞게 바꾸세요. " +
  "주민등록번호, 계좌번호, 이름, 전화번호 같은 민감정보는 입력하지 말라고 안내하세요.";

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
        `${INITIAL_REVIEW_REQUEST} ` +
        `양도가액, 취득가액, 필요경비처럼 금액이 자연어 또는 쉼표 포함 숫자로 입력되면 normalize_amount_input을 먼저 호출해 원 단위 정수로 변환하세요. ` +
        `양도일, 취득일, 거주기간 산정용 날짜가 다양한 형식으로 입력되면 normalize_date_input을 먼저 호출해 YYYY-MM-DD 형식으로 변환하세요. ` +
        `자산 종류, 취득 방법, 예/아니오, 주택 수, 거주기간, 비과세 검증 상태, 소유 형태, 필요경비가 자연어로 입력되면 대응하는 normalize_* 도구를 먼저 호출하세요. ` +
        `사용자 답변을 caseData에 누적한 뒤 prepare_capital_gains_case_checklist와 validate_capital_gains_case를 사용해 누락값과 지원 범위를 확인하세요. ` +
        `Do not calculate until missing values and supported scenario checks have been validated.`
    }
  );

  server.registerPrompt(
    "start_capital_gains_tax_review",
    {
      title: "양도소득세 검토 시작",
      description:
        "개인정보 없이 필요한 항목을 질문하며 양도소득세 검토를 시작합니다."
    },
    () => ({
      description: "양도소득세 검토 시작 안내",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: INITIAL_REVIEW_REQUEST
          }
        }
      ]
    })
  );

  server.registerTool(
    "normalize_asset_input",
    {
      title: "자산 종류 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 아파트, 빌라, 상가, 사업용 토지, 비사업용 토지 같은 자산 종류 답변을 계산 도구의 asset.subType 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Asset Type Input"),
      inputSchema: {
        rawAsset: z.string().min(1).describe("사용자가 입력한 자산 종류. 예: 아파트, 상가, 사업용 토지")
      }
    },
    async ({ rawAsset }) => {
      const result = normalizeAssetInput(rawAsset);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_acquisition_method_input",
    {
      title: "취득 방법 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 샀어요, 매매, 상속받음, 증여 같은 취득 방법 답변을 계산 도구의 acquisition.method 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Acquisition Method Input"),
      inputSchema: {
        rawMethod: z.string().min(1).describe("사용자가 입력한 취득 방법. 예: 샀어요, 매매, 상속받음, 증여")
      }
    },
    async ({ rawMethod }) => {
      const result = normalizeAcquisitionMethodInput(rawMethod);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_boolean_input",
    {
      title: "예/아니오 답변 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 네, 아니요, 없음, 모름 같은 예/아니오 답변을 조정대상지역 여부, 비과세 요청 여부, 동일연도 다른 양도 여부에 사용할 boolean 또는 unknown 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Boolean Input"),
      inputSchema: {
        rawValue: z.string().min(1).describe("사용자가 입력한 예/아니오 답변. 예: 네, 아니요, 없음, 모름")
      }
    },
    async ({ rawValue }) => {
      const result = normalizeBooleanInput(rawValue);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_duration_input",
    {
      title: "거주기간 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 2년, 2년 6개월, 30개월, 거주 안 함 같은 거주기간 답변을 household.residenceYears에 사용할 정수 연 단위 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Residence Duration Input"),
      inputSchema: {
        rawDuration: z.string().min(1).describe("사용자가 입력한 거주기간. 예: 2년, 2년 6개월, 30개월, 거주 안 함")
      }
    },
    async ({ rawDuration }) => {
      const result = normalizeDurationInput(rawDuration);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_count_input",
    {
      title: "개수 입력 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 1채, 한 채, 두 채, 없음 같은 주택 수 답변을 household.houseCount에 사용할 정수 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Count Input"),
      inputSchema: {
        rawCount: z.string().min(1).describe("사용자가 입력한 개수. 예: 1채, 한 채, 두 채, 없음")
      }
    },
    async ({ rawCount }) => {
      const result = normalizeCountInput(rawCount);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_exemption_verification_input",
    {
      title: "비과세 검증 상태 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 세무사가 확인했어요, 아직 검증 안 했어요, 해당 없음, 모르겠어요 같은 비과세 검증 상태 답변을 household.exemptionVerificationStatus 값으로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Exemption Verification Input"),
      inputSchema: {
        rawStatus: z.string().min(1).describe("사용자가 입력한 비과세 검증 상태. 예: 세무사가 확인했어요, 아직 검증 안 했어요, 해당 없음")
      }
    },
    async ({ rawStatus }) => {
      const result = normalizeExemptionVerificationInput(rawStatus);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_ownership_input",
    {
      title: "소유 형태 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 단독명의, 부부 공동명의, 반반, 저 60 배우자 40 같은 소유 형태 답변을 ownership 구조로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Ownership Input"),
      inputSchema: {
        rawOwnership: z.string().min(1).describe("사용자가 입력한 소유 형태와 지분. 예: 단독명의, 부부 반반, 저 60 배우자 40")
      }
    },
    async ({ rawOwnership }) => {
      const result = normalizeOwnershipInput(rawOwnership);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_expense_input",
    {
      title: "필요경비 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 취득세 1200만원 증빙 있음, 복비 500만원, 법무사비 같은 필요경비 답변을 expenses 항목 구조로 변환합니다.`,
      annotations: readOnlyAnnotations("Normalize Expense Input"),
      inputSchema: {
        rawExpense: z.string().min(1).describe("사용자가 입력한 필요경비. 예: 취득세 1200만원 증빙 있음")
      }
    },
    async ({ rawExpense }) => {
      const result = normalizeExpenseInput(rawExpense);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_date_input",
    {
      title: "날짜 입력 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 사용자가 입력한 2025.01.01.-2026.01.01, 250101-260101, 20250101~20260101 같은 날짜 표현을 계산 도구가 사용하는 YYYY-MM-DD 형식으로 변환합니다. ` +
        `양도일, 취득일, 보유기간 관련 날짜를 caseData에 넣기 전에 이 도구로 정규화하세요.`,
      annotations: readOnlyAnnotations("Normalize Korean Date Input"),
      inputSchema: {
        rawDate: z
          .string()
          .min(1)
          .describe("사용자가 입력한 날짜 또는 기간 표현. 예: 2026.01.01, 260101, 20250101~20260101")
      }
    },
    async ({ rawDate }) => {
      const result = normalizeDateInput(rawDate);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    }
  );

  server.registerTool(
    "normalize_amount_input",
    {
      title: "금액 입력 정규화",
      description:
        `${SERVICE_DISPLAY_NAME}는 사용자가 입력한 750,000,000, 7.5억, 7억5000만, 7억 5천만 같은 금액 표현을 계산 도구가 사용하는 원 단위 정수로 변환합니다. ` +
        `양도가액, 취득가액, 필요경비를 caseData에 넣기 전에 이 도구로 정규화하세요.`,
      annotations: readOnlyAnnotations("Normalize Korean Amount Input"),
      inputSchema: {
        rawAmount: z
          .string()
          .min(1)
          .describe("사용자가 입력한 금액 표현. 예: 750,000,000, 7.5억, 7억5000만, 7억 5천만")
      }
    },
    async ({ rawAmount }) => {
      const result = normalizeAmountInput(rawAmount);
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
        `${SERVICE_DISPLAY_NAME}는 사용자가 입력한 caseData를 기준으로 누락값, 1세대 1주택, 조정대상지역, 공동명의, 취득 방법, 동일연도 양도, 필요경비 증빙 체크리스트를 생성합니다. ` +
        `반환된 질문에 답을 채운 뒤 validate_capital_gains_case를 호출하세요. ` +
        `값을 임의로 추정하지 않고 기존 계산 도구의 입력 구조와 호환되는 필드명을 사용합니다.`,
      annotations: readOnlyAnnotations("Prepare Pre-calculation Checklist"),
      inputSchema: {
        caseData: z
          .record(z.string(), z.unknown())
          .describe("사용자 답변을 누적한 양도소득세 사건 데이터")
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
        `${SERVICE_DISPLAY_NAME}는 계산 전에 필수 입력값, 날짜, 소유 지분, 적용 세법 기준과 지원 범위를 검증합니다. 개인정보 없이 수집한 caseData를 기준으로 동작하며 누락된 값을 임의로 추정하지 않습니다.`,
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
        `${SERVICE_DISPLAY_NAME}는 검증이 완료된 부동산 양도 사건을 바탕으로 양도소득세와 개인지방소득세 예상액을 계산합니다. 같은 해 복수 양도나 상속·증여 취득 등 현재 지원하지 않는 사건은 계산하지 않습니다. 결과는 검토용 예상액이며 확정 신고세액이 아닙니다.`,
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
