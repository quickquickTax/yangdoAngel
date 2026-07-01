import { runValidation } from "./validate-capital-gains-case.js";
import { isWithinGiftCarryoverPeriod } from "../domain/acquisition.js";

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

export type ChecklistQuestionCategory = ChecklistItem["category"] | "validation";

export interface ChecklistQuestion {
  field: string | null;
  question: string;
  requiredForCalculation: boolean;
  reason: string;
  status: ChecklistItem["status"] | "validation_question";
  source: "checklist" | "validation";
}

export interface ChecklistQuestionGroup {
  category: ChecklistQuestionCategory;
  title: string;
  description: string;
  requiredCount: number;
  reviewCount: number;
  unsupportedRiskCount: number;
  questions: ChecklistQuestion[];
}

export interface CapitalGainsCaseChecklistResult {
  status: "ready_for_validation" | "needs_input" | "unsupported_risk";
  checklistItems: ChecklistItem[];
  questions: string[];
  questionGroups: ChecklistQuestionGroup[];
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

const QUESTION_GROUP_META: Record<
  ChecklistQuestionCategory,
  { title: string; description: string }
> = {
  transaction: {
    title: "거래 정보",
    description: "양도일, 취득일, 양도가액, 취득가액처럼 세액 계산의 기본값입니다."
  },
  asset: {
    title: "자산 정보",
    description: "주택, 건물, 토지 등 자산 유형과 사업용 여부를 확인합니다."
  },
  ownership: {
    title: "소유 형태",
    description: "단독명의와 공동명의, 지분율, 기본공제 사용 여부를 확인합니다."
  },
  household: {
    title: "세대 및 비과세",
    description: "주택 수, 거주기간, 조정대상지역, 1세대 1주택 비과세 관련 항목입니다."
  },
  annual: {
    title: "과세연도 맥락",
    description: "같은 과세연도 다른 양도 여부처럼 합산 검토가 필요한 항목입니다."
  },
  expense: {
    title: "필요경비 및 증빙",
    description: "취득세, 중개수수료, 법무사 비용, 자본적 지출과 증빙 보유 여부입니다."
  },
  support: {
    title: "지원 범위",
    description: "세법 기준일과 현재 계산 엔진이 지원하는 사건인지 확인합니다."
  },
  validation: {
    title: "검증 결과 확인",
    description: "입력값 검증 과정에서 추가로 확인이 필요한 질문입니다."
  }
};

const QUESTION_GROUP_ORDER: ChecklistQuestionCategory[] = [
  "transaction",
  "asset",
  "ownership",
  "household",
  "annual",
  "expense",
  "support",
  "validation"
];

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
    reason: "취득 방법에 따라 취득가액과 보유기간 계산 기준이 달라집니다."
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

function buildQuestionGroups(
  checklistItems: ChecklistItem[],
  validationQuestions: string[]
): ChecklistQuestionGroup[] {
  const seenChecklistQuestions = new Set(checklistItems.map((item) => item.question));
  const grouped = new Map<ChecklistQuestionCategory, ChecklistQuestion[]>();

  for (const item of checklistItems) {
    const questions = grouped.get(item.category) ?? [];
    questions.push({
      field: item.field,
      question: item.question,
      requiredForCalculation: item.requiredForCalculation,
      reason: item.reason,
      status: item.status,
      source: "checklist"
    });
    grouped.set(item.category, questions);
  }

  for (const question of validationQuestions) {
    if (seenChecklistQuestions.has(question)) {
      continue;
    }
    const questions = grouped.get("validation") ?? [];
    questions.push({
      field: null,
      question,
      requiredForCalculation: true,
      reason: "검증 단계에서 추가 확인이 필요한 항목입니다.",
      status: "validation_question",
      source: "validation"
    });
    grouped.set("validation", questions);
  }

  return QUESTION_GROUP_ORDER.flatMap((category) => {
    const questions = grouped.get(category);
    if (!questions || questions.length === 0) {
      return [];
    }
    const meta = QUESTION_GROUP_META[category];
    return [
      {
        category,
        title: meta.title,
        description: meta.description,
        requiredCount: questions.filter(
          (question) =>
            question.requiredForCalculation &&
            (question.status === "missing" ||
              question.status === "validation_question")
        ).length,
        reviewCount: questions.filter((question) => question.status === "needs_review")
          .length,
        unsupportedRiskCount: questions.filter(
          (question) => question.status === "unsupported_risk"
        ).length,
        questions
      }
    ];
  });
}

export function prepareCapitalGainsCaseChecklist(
  caseData: Record<string, unknown>
): CapitalGainsCaseChecklistResult {
  const checklistItems: ChecklistItem[] = REQUIRED_ITEMS.filter(
    (item) => !hasNested(caseData, item.field)
  ).map((item) => ({ ...item, status: "missing" }));

  const acquisitionMethod = getNested(caseData, "acquisition.method");
  if (acquisitionMethod === "other") {
    checklistItems.push({
      field: "acquisition.method",
      category: "support",
      question: "부담부증여·교환 등 기타 취득은 세무전문가 검토 대상으로 전환해야 합니다.",
      requiredForCalculation: true,
      reason: "현재 계산 엔진은 기타 취득을 지원하지 않습니다.",
      status: "unsupported_risk"
    });
  }

  if (
    (acquisitionMethod === "inheritance" || acquisitionMethod === "gift") &&
    !hasNested(caseData, "acquisition.valuation")
  ) {
    checklistItems.push({
      field: "acquisition.valuation",
      category: "transaction",
      question: "상속·증여 당시 신고·결정가액이 있습니까? 없다면 부동산 주소로 평가가액을 조회해도 될까요?",
      requiredForCalculation: true,
      reason: "상속·증여 취득가액은 평가기준일 현재 확인된 평가액을 사용합니다.",
      status: "missing"
    });
  }

  if (
    acquisitionMethod === "inheritance" &&
    !hasNested(caseData, "inheritanceDetails.decedentAcquisitionDate")
  ) {
    checklistItems.push({
      field: "inheritanceDetails.decedentAcquisitionDate",
      category: "transaction",
      question: "피상속인이 해당 재산을 최초로 취득한 날은 언제입니까?",
      requiredForCalculation: true,
      reason: "상속재산의 세율 적용 보유기간은 피상속인 취득일부터 계산합니다.",
      status: "missing"
    });
  }

  if (acquisitionMethod === "gift") {
    if (!hasNested(caseData, "giftDetails.donorRelationship")) {
      checklistItems.push({
        field: "giftDetails.donorRelationship",
        category: "transaction",
        question: "증여자는 배우자, 직계존비속, 기타 특수관계인, 무관계인 중 누구입니까?",
        requiredForCalculation: true,
        reason: "배우자·직계존비속 증여는 이월과세 여부를 확인해야 합니다.",
        status: "missing"
      });
    }
    if (!hasNested(caseData, "giftDetails.donorDeceasedAtTransfer")) {
      checklistItems.push({
        field: "giftDetails.donorDeceasedAtTransfer",
        category: "support",
        question: "양도일 현재 증여자가 사망했습니까?",
        requiredForCalculation: true,
        reason: "증여자 사망은 이월과세 배제 검토 사유입니다.",
        status: "missing"
      });
    }
    const relationship = getNested(caseData, "giftDetails.donorRelationship");
    const acquisitionDate = getNested(caseData, "acquisition.date");
    const transferDate = getNested(caseData, "transfer.date");
    let carryoverPossible = false;
    if (
      (relationship === "spouse" || relationship === "lineal_ascendant_descendant") &&
      typeof acquisitionDate === "string" &&
      typeof transferDate === "string"
    ) {
      try {
        carryoverPossible = isWithinGiftCarryoverPeriod(acquisitionDate, transferDate);
      } catch {
        // 날짜 검증 질문은 별도로 생성된다.
      }
    }
    if (carryoverPossible && !hasNested(caseData, "giftDetails.donorOriginalAcquisition")) {
      checklistItems.push({
        field: "giftDetails.donorOriginalAcquisition",
        category: "transaction",
        question: "증여자의 최초 취득일과 취득가액은 각각 얼마입니까?",
        requiredForCalculation: true,
        reason: "이월과세 적용 시 증여자의 원취득 정보로 양도차익과 보유기간을 계산합니다.",
        status: "missing"
      });
    }
    if (carryoverPossible && !hasNested(caseData, "giftDetails.giftTaxAssessment")) {
      checklistItems.push({
        field: "giftDetails.giftTaxAssessment",
        category: "expense",
        question: "증여세 산출세액, 전체 증여세 과세가액, 이 재산의 증여 과세가액은 각각 얼마입니까? 납부세액이 없으면 0이라고 알려주세요.",
        requiredForCalculation: true,
        reason: "이월과세 시 공제할 증여세 상당액을 법정 비율로 계산합니다.",
        status: "missing"
      });
    }
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
  const questionGroups = buildQuestionGroups(
    checklistItems,
    validationPreview.questions
  );

  return {
    status: hasUnsupportedRisk
      ? "unsupported_risk"
      : requiredMissing
        ? "needs_input"
        : "ready_for_validation",
    checklistItems,
    questions,
    questionGroups,
    validationPreview,
    nextTool: validationPreview.validForCalculation
      ? "calculate_capital_gains_tax"
      : "validate_capital_gains_case"
  };
}
