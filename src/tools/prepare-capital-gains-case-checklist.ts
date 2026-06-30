import { runValidation } from "./validate-capital-gains-case.js";

export interface ChecklistItem {
  field: string;
  category:
    | "transaction"
    | "asset"
    | "ownership"
    | "household"
    | "annual"
    | "expense"
    | "support";
  question: string;
  requiredForCalculation: boolean;
  reason: string;
  status: "missing" | "needs_review" | "unsupported_risk";
}

export interface CapitalGainsCaseChecklistResult {
  status: "ready_for_validation" | "needs_input" | "unsupported_risk";
  checklistItems: ChecklistItem[];
  questions: string[];
  validationPreview: ReturnType<typeof runValidation>;
  nextTool: "validate_capital_gains_case" | "calculate_capital_gains_tax";
}

function hasNested(target: Record<string, unknown>, path: string): boolean {
  return (
    path.split(".").reduce<unknown>((cursor, part) => {
      if (!cursor || typeof cursor !== "object") {
        return undefined;
      }
      return (cursor as Record<string, unknown>)[part];
    }, target) !== undefined
  );
}

function getNested(target: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, part) => {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    return (cursor as Record<string, unknown>)[part];
  }, target);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const REQUIRED_ITEMS: Array<Omit<ChecklistItem, "status">> = [
  {
    field: "ruleDate",
    category: "support",
    question: "어느 기준일의 세법으로 계산할까요?",
    requiredForCalculation: true,
    reason: "지원 규칙 기준일이 있어야 세율과 공제 규칙을 선택할 수 있습니다."
  },
  {
    field: "transfer.date",
    category: "transaction",
    question: "양도일 또는 양도 잔금일은 언제입니까?",
    requiredForCalculation: true,
    reason: "보유기간, 장기보유특별공제, 규칙 적용기간 판단에 필요합니다."
  },
  {
    field: "transfer.price",
    category: "transaction",
    question: "양도가액은 얼마입니까?",
    requiredForCalculation: true,
    reason: "양도차익 계산의 기본 입력값입니다."
  },
  {
    field: "acquisition.date",
    category: "transaction",
    question: "취득일 또는 취득 잔금일은 언제입니까?",
    requiredForCalculation: true,
    reason: "보유기간과 장기보유특별공제 판단에 필요합니다."
  },
  {
    field: "acquisition.price",
    category: "transaction",
    question: "취득가액은 얼마입니까?",
    requiredForCalculation: true,
    reason: "양도차익 계산의 기본 입력값입니다."
  },
  {
    field: "acquisition.method",
    category: "support",
    question: "취득 방법은 매매, 상속, 증여 중 무엇입니까?",
    requiredForCalculation: true,
    reason: "현재 계산 엔진은 매매 취득만 지원합니다."
  },
  {
    field: "asset.subType",
    category: "asset",
    question: "자산 종류는 주택, 건물, 토지 중 무엇입니까?",
    requiredForCalculation: true,
    reason: "자산 유형별 세율, 공제, 미지원 여부가 달라집니다."
  },
  {
    field: "ownership",
    category: "ownership",
    question: "단독명의입니까, 공동명의입니까? 공동명의라면 각 소유자 지분율은 얼마입니까?",
    requiredForCalculation: true,
    reason: "공동명의는 지분별 과세표준과 기본공제를 나누어 계산합니다."
  },
  {
    field: "household.houseCount",
    category: "household",
    question: "양도일 현재 세대 기준 주택 수는 몇 채입니까?",
    requiredForCalculation: true,
    reason: "1세대 1주택 비과세와 주택 관련 판단에 필요합니다."
  },
  {
    field: "household.residenceYears",
    category: "household",
    question: "해당 주택의 실제 거주기간은 몇 년입니까?",
    requiredForCalculation: true,
    reason: "거주기간은 1세대 1주택 장기보유특별공제 검토에 필요합니다."
  },
  {
    field: "household.isAdjustedArea",
    category: "household",
    question: "취득 또는 보유 기간 중 조정대상지역 해당 여부를 확인했습니까?",
    requiredForCalculation: true,
    reason: "주택 관련 요건 검토에 필요한 사전 확인 항목입니다."
  },
  {
    field: "household.oneHouseExemptionClaimed",
    category: "household",
    question: "1세대 1주택 비과세 적용을 요청합니까?",
    requiredForCalculation: true,
    reason: "비과세 요청 여부에 따라 검증 기준이 달라집니다."
  },
  {
    field: "household.exemptionVerificationStatus",
    category: "household",
    question: "1세대 1주택 비과세 요건은 세무전문가가 검증했습니까?",
    requiredForCalculation: true,
    reason: "현재 엔진은 비과세 요건이 검증된 경우에만 비과세 계산을 허용합니다."
  },
  {
    field: "annualContext.otherTransfersExist",
    category: "annual",
    question: "같은 과세연도에 다른 자산 양도가 있습니까?",
    requiredForCalculation: true,
    reason: "동일 연도 복수 양도는 합산·차손통산 검토가 필요해 현재 미지원입니다."
  }
];

export function prepareCapitalGainsCaseChecklist(
  caseData: Record<string, unknown>
): CapitalGainsCaseChecklistResult {
  const checklistItems: ChecklistItem[] = REQUIRED_ITEMS.filter(
    (item) => !hasNested(caseData, item.field)
  ).map((item) => ({ ...item, status: "missing" }));

  const acquisitionMethod = getNested(caseData, "acquisition.method");
  if (
    acquisitionMethod &&
    acquisitionMethod !== "purchase" &&
    !checklistItems.some((item) => item.field === "acquisition.method")
  ) {
    checklistItems.push({
      field: "acquisition.method",
      category: "support",
      question: "상속·증여 등 매매 외 취득은 세무전문가 검토 대상으로 전환해야 합니다.",
      requiredForCalculation: true,
      reason: "현재 계산 엔진은 매매 외 취득을 지원하지 않습니다.",
      status: "unsupported_risk"
    });
  }

  if (
    getNested(caseData, "annualContext.otherTransfersExist") === true &&
    !checklistItems.some((item) => item.field === "annualContext.otherTransfersExist")
  ) {
    checklistItems.push({
      field: "annualContext.otherTransfersExist",
      category: "annual",
      question: "동일 과세연도 복수 양도는 합산 검토가 필요하므로 자동 계산하지 않습니다.",
      requiredForCalculation: true,
      reason: "동일 연도 복수 양도는 현재 미지원 사건입니다.",
      status: "unsupported_risk"
    });
  }

  const expenses = getNested(caseData, "expenses");
  if (!Array.isArray(expenses) || expenses.length === 0) {
    checklistItems.push({
      field: "expenses",
      category: "expense",
      question: "취득세, 중개수수료, 법무사 비용, 자본적 지출 등 필요경비와 증빙이 있습니까?",
      requiredForCalculation: false,
      reason: "필요경비 누락은 예상세액을 과대 계산할 수 있습니다.",
      status: "needs_review"
    });
  }

  if (getNested(caseData, "asset.subType") === "land_business") {
    checklistItems.push({
      field: "asset.subType",
      category: "asset",
      question: "토지가 사업용인지 비사업용인지 증빙으로 확인했습니까?",
      requiredForCalculation: true,
      reason: "비사업용 토지는 중과 여부가 달라질 수 있습니다.",
      status: "needs_review"
    });
  }

  const validationPreview = runValidation(caseData);
  const hasUnsupportedRisk = checklistItems.some(
    (item) => item.status === "unsupported_risk"
  );
  const requiredMissing = checklistItems.some(
    (item) => item.requiredForCalculation && item.status === "missing"
  );

  const questions = unique([
    ...checklistItems.map((item) => item.question),
    ...validationPreview.questions
  ]);

  return {
    status: hasUnsupportedRisk
      ? "unsupported_risk"
      : requiredMissing
        ? "needs_input"
        : "ready_for_validation",
    checklistItems,
    questions,
    validationPreview,
    nextTool: validationPreview.validForCalculation
      ? "calculate_capital_gains_tax"
      : "validate_capital_gains_case"
  };
}
