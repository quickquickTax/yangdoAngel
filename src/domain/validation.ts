import { calculateFullHoldingYears, parseIsoDate, compareDates } from "./date.js";
import type {
  CapitalGainsCase,
  ValidationIssue,
  ValidationResult
} from "./types.js";
import {
  getRules,
  isRuleApplicableOn,
  listSupportedRuleDates
} from "../rules/rule-registry.js";
import { isWithinGiftCarryoverPeriod } from "./acquisition.js";

function addIssue(
  issues: ValidationIssue[],
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  field?: string
): void {
  issues.push(field ? { severity, code, message, field } : { severity, code, message });
}

function addMonths(value: string, months: number): string {
  const date = parseIsoDate(value);
  const first = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.day, lastDay))
  )
    .toISOString()
    .slice(0, 10);
}

function inEvaluationWindow(
  method: "inheritance" | "gift",
  acquisitionDate: string,
  valueDate: string
): boolean {
  parseIsoDate(valueDate);
  const from = addMonths(acquisitionDate, -6);
  const to = addMonths(acquisitionDate, method === "inheritance" ? 6 : 3);
  return valueDate >= from && valueDate <= to;
}

export function validateCapitalGainsCase(
  input: Partial<CapitalGainsCase>
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const questions: string[] = [];

  if (!input.ruleDate) {
    addIssue(issues, "error", "RULE_DATE_REQUIRED", "계산 규칙 기준일이 필요합니다.", "ruleDate");
    questions.push("어느 기준일의 세법으로 계산할까요?");
  } else if (!listSupportedRuleDates().includes(input.ruleDate)) {
    addIssue(
      issues,
      "unsupported",
      "RULE_DATE_UNSUPPORTED",
      `지원하지 않는 기준일입니다. 지원 기준일: ${listSupportedRuleDates().join(", ")}`,
      "ruleDate"
    );
  }

  if (!input.transfer) {
    addIssue(issues, "error", "TRANSFER_REQUIRED", "양도 정보가 필요합니다.", "transfer");
    questions.push("양도일과 양도가액은 각각 얼마입니까?");
  } else {
    if (!Number.isSafeInteger(input.transfer.price) || input.transfer.price <= 0) {
      addIssue(issues, "error", "TRANSFER_PRICE_INVALID", "양도가액은 0보다 큰 정수여야 합니다.", "transfer.price");
      questions.push("양도가액은 원 단위의 0보다 큰 정수로 얼마입니까?");
    }
    try {
      parseIsoDate(input.transfer.date);
    } catch (error) {
      addIssue(issues, "error", "TRANSFER_DATE_INVALID", (error as Error).message, "transfer.date");
      questions.push("양도일은 YYYY-MM-DD 형식으로 언제입니까?");
    }
  }

  if (!input.acquisition) {
    addIssue(issues, "error", "ACQUISITION_REQUIRED", "취득 정보가 필요합니다.", "acquisition");
    questions.push("취득일, 취득가액, 취득 방법은 각각 무엇입니까?");
  } else {
    if (!Number.isSafeInteger(input.acquisition.price) || input.acquisition.price <= 0) {
      addIssue(issues, "error", "ACQUISITION_PRICE_INVALID", "취득가액은 0보다 큰 정수여야 합니다.", "acquisition.price");
      questions.push("취득가액은 원 단위의 0보다 큰 정수로 얼마입니까?");
    }
    try {
      parseIsoDate(input.acquisition.date);
    } catch (error) {
      addIssue(issues, "error", "ACQUISITION_DATE_INVALID", (error as Error).message, "acquisition.date");
      questions.push("취득일은 YYYY-MM-DD 형식으로 언제입니까?");
    }
    if (input.acquisition.method === "other") {
      addIssue(
        issues,
        "unsupported",
        "ACQUISITION_METHOD_UNSUPPORTED",
        "부담부증여·교환 등 기타 취득은 현재 버전에서 지원하지 않습니다.",
        "acquisition.method"
      );
    }
    if (
      (input.acquisition.method === "inheritance" ||
        input.acquisition.method === "gift") &&
      !input.acquisition.valuation
    ) {
      addIssue(
        issues,
        "error",
        "ACQUISITION_VALUATION_REQUIRED",
        "상속·증여 취득은 평가가액의 근거와 출처가 필요합니다.",
        "acquisition.valuation"
      );
      questions.push("상속·증여 당시 평가가액은 어떤 근거로 확인했습니까?");
    }
    if (
      input.acquisition.valuation &&
      input.acquisition.valuation.amount !== input.acquisition.price
    ) {
      addIssue(
        issues,
        "error",
        "VALUATION_AMOUNT_MISMATCH",
        "취득가액과 평가 결과 금액이 일치해야 합니다.",
        "acquisition.price"
      );
    }
    if (
      input.acquisition.valuation?.status === "api_estimated" &&
      input.acquisition.date < "2023-01-01"
    ) {
      addIssue(
        issues,
        "unsupported",
        "HISTORICAL_API_VALUATION_UNSUPPORTED",
        "2023년 이전 상속·증여는 신고·결정·경정된 확정 평가액이 있어야 계산할 수 있습니다.",
        "acquisition.valuation.status"
      );
    }
    const valuation = input.acquisition.valuation;
    if (
      valuation &&
      (input.acquisition.method === "inheritance" || input.acquisition.method === "gift")
    ) {
      const isFinalAuthority =
        valuation.status === "determined" || valuation.status === "corrected";
      try {
        if (
          !isFinalAuthority &&
          !inEvaluationWindow(
            input.acquisition.method,
            input.acquisition.date,
            valuation.referenceDate
          )
        ) {
          addIssue(
            issues,
            "error",
            "VALUATION_DATE_OUT_OF_RANGE",
            "평가 근거일이 상속·증여 평가기간을 벗어났습니다.",
            "acquisition.valuation.referenceDate"
          );
        }
      } catch (error) {
        addIssue(
          issues,
          "error",
          "VALUATION_DATE_INVALID",
          (error as Error).message,
          "acquisition.valuation.referenceDate"
        );
      }
      if (valuation.basis === "appraisal" && !valuation.appraisalDetails) {
        addIssue(
          issues,
          "error",
          "APPRAISAL_DETAILS_REQUIRED",
          "감정가액은 감정기관 수, 가격산정기준일과 평가서 작성일이 필요합니다.",
          "acquisition.valuation.appraisalDetails"
        );
      } else if (valuation.basis === "appraisal" && valuation.appraisalDetails) {
        const details = valuation.appraisalDetails;
        if (
          details.appraiserCount === 1 &&
          (!details.propertyStandardPrice || details.propertyStandardPrice > 1_000_000_000)
        ) {
          addIssue(
            issues,
            "error",
            "SINGLE_APPRAISER_NOT_ALLOWED",
            "감정기관 1곳의 가액은 해당 부동산 전체 기준시가가 10억원 이하로 확인된 경우에만 사용할 수 있습니다.",
            "acquisition.valuation.appraisalDetails.appraiserCount"
          );
        }
        if (!isFinalAuthority) {
          for (const [field, date] of [
            ["priceBasisDate", details.priceBasisDate],
            ["reportDate", details.reportDate]
          ] as const) {
            try {
              if (!inEvaluationWindow(input.acquisition.method, input.acquisition.date, date)) {
                addIssue(
                  issues,
                  "error",
                  "APPRAISAL_DATE_OUT_OF_RANGE",
                  "감정평가 가격산정기준일과 평가서 작성일은 평가기간 안에 있어야 합니다.",
                  `acquisition.valuation.appraisalDetails.${field}`
                );
              }
            } catch (error) {
              addIssue(
                issues,
                "error",
                "APPRAISAL_DATE_INVALID",
                (error as Error).message,
                `acquisition.valuation.appraisalDetails.${field}`
              );
            }
          }
        }
      }
      if (valuation.basis === "similar_transaction") {
        const match = valuation.similarPropertyMatch;
        if (!match) {
          addIssue(
            issues,
            "error",
            "SIMILAR_PROPERTY_MATCH_REQUIRED",
            "유사매매사례는 전용면적 차이와 공동주택가격 차이를 확인해야 합니다.",
            "acquisition.valuation.similarPropertyMatch"
          );
        } else if (
          match.areaDiffPercent > 5 ||
          match.standardPriceDiffPercent > 5
        ) {
          addIssue(
            issues,
            "error",
            "SIMILAR_PROPERTY_MATCH_INVALID",
            "유사매매사례의 전용면적 차이와 공동주택가격 차이는 각각 5% 이하여야 합니다.",
            "acquisition.valuation.similarPropertyMatch"
          );
        }
      }
    }
  }

  if (input.transfer && input.acquisition) {
    try {
      const transfer = parseIsoDate(input.transfer.date);
      const acquisition = parseIsoDate(input.acquisition.date);
      if (compareDates(transfer, acquisition) <= 0) {
        addIssue(
          issues,
          "error",
          "DATE_ORDER_INVALID",
          "양도일은 취득일 이후여야 합니다.",
          "transfer.date"
        );
      }
    } catch {
      // 개별 날짜 오류가 이미 추가되어 있다.
    }
  }

  if (input.acquisition?.method === "inheritance") {
    if (!input.inheritanceDetails?.decedentAcquisitionDate) {
      addIssue(
        issues,
        "error",
        "DECEDENT_ACQUISITION_DATE_REQUIRED",
        "상속재산의 세율 적용 보유기간 계산을 위해 피상속인의 취득일이 필요합니다.",
        "inheritanceDetails.decedentAcquisitionDate"
      );
      questions.push("피상속인이 해당 재산을 최초로 취득한 날은 언제입니까?");
    } else {
      try {
        const decedentDate = parseIsoDate(input.inheritanceDetails.decedentAcquisitionDate);
        const inheritanceDate = parseIsoDate(input.acquisition.date);
        if (compareDates(inheritanceDate, decedentDate) < 0) {
          addIssue(
            issues,
            "error",
            "DECEDENT_DATE_ORDER_INVALID",
            "피상속인의 취득일은 상속개시일보다 늦을 수 없습니다.",
            "inheritanceDetails.decedentAcquisitionDate"
          );
        }
      } catch (error) {
        addIssue(
          issues,
          "error",
          "DECEDENT_ACQUISITION_DATE_INVALID",
          (error as Error).message,
          "inheritanceDetails.decedentAcquisitionDate"
        );
      }
    }
  }

  if (input.acquisition?.method === "gift") {
    if (!input.giftDetails) {
      addIssue(
        issues,
        "error",
        "GIFT_DETAILS_REQUIRED",
        "증여자 관계와 이월과세 판정 정보가 필요합니다.",
        "giftDetails"
      );
      questions.push("증여자는 배우자, 직계존비속, 그 밖의 특수관계인 중 누구입니까?");
    } else {
      const relationship = input.giftDetails.donorRelationship;
      if (relationship === "other_related") {
        addIssue(
          issues,
          "unsupported",
          "RELATED_PARTY_GIFT_UNSUPPORTED",
          "배우자·직계존비속 외 특수관계인 증여는 부당행위계산 검토가 필요해 현재 자동계산하지 않습니다.",
          "giftDetails.donorRelationship"
        );
      }
      if (input.transfer) {
        try {
          const carryover =
            (relationship === "spouse" ||
              relationship === "lineal_ascendant_descendant") &&
            isWithinGiftCarryoverPeriod(input.acquisition.date, input.transfer.date);
          if (carryover && !input.giftDetails.donorOriginalAcquisition) {
            addIssue(
              issues,
              "error",
              "DONOR_ACQUISITION_REQUIRED",
              "이월과세 계산을 위해 증여자의 최초 취득일과 취득가액이 필요합니다.",
              "giftDetails.donorOriginalAcquisition"
            );
          }
          if (carryover && !input.giftDetails.giftTaxAssessment) {
            addIssue(
              issues,
              "error",
              "GIFT_TAX_ASSESSMENT_REQUIRED",
              "이월과세 필요경비 계산을 위해 증여세 산출세액과 과세가액 정보가 필요합니다.",
              "giftDetails.giftTaxAssessment"
            );
          }
          const assessment = input.giftDetails.giftTaxAssessment;
          if (
            carryover &&
            assessment &&
            (assessment.transferredAssetTaxableValue >
              assessment.totalTaxableGiftValue ||
              (assessment.calculatedTax > 0 &&
                assessment.totalTaxableGiftValue === 0))
          ) {
            addIssue(
              issues,
              "error",
              "GIFT_TAX_ASSESSMENT_INVALID",
              "해당 자산의 증여 과세가액은 전체 증여세 과세가액을 초과할 수 없습니다.",
              "giftDetails.giftTaxAssessment"
            );
          }
          const original = input.giftDetails.donorOriginalAcquisition;
          if (carryover && original && original.date > input.acquisition.date) {
            addIssue(
              issues,
              "error",
              "DONOR_ACQUISITION_DATE_ORDER_INVALID",
              "증여자의 최초 취득일은 증여일보다 늦을 수 없습니다.",
              "giftDetails.donorOriginalAcquisition.date"
            );
          }
          if (carryover && input.giftDetails.donorDeceasedAtTransfer) {
            addIssue(
              issues,
              "unsupported",
              "DECEASED_DONOR_EXCLUSION_REVIEW_REQUIRED",
              "양도 당시 증여자가 사망한 사건은 이월과세 배제 검토가 필요합니다.",
              "giftDetails.donorDeceasedAtTransfer"
            );
          }
          if (carryover && input.giftDetails.expropriationExclusionPossible) {
            addIssue(
              issues,
              "unsupported",
              "EXPROPRIATION_EXCLUSION_REVIEW_REQUIRED",
              "협의매수·수용 사건은 이월과세 배제 검토가 필요합니다.",
              "giftDetails.expropriationExclusionPossible"
            );
          }
        } catch {
          // 기본 취득일·양도일 오류에서 보고한다.
        }
      }
    }
  }

  if (
    input.ruleDate &&
    listSupportedRuleDates().includes(input.ruleDate) &&
    input.transfer
  ) {
    try {
      parseIsoDate(input.transfer.date);
      const rules = getRules(input.ruleDate);
      if (!isRuleApplicableOn(rules, input.transfer.date)) {
        addIssue(
          issues,
          "error",
          "RULE_NOT_EFFECTIVE_ON_TRANSFER_DATE",
          `선택한 규칙은 양도일에 유효하지 않습니다. 적용기간: ${rules.effectiveFrom} ~ ${rules.effectiveTo ?? "현재"}`,
          "ruleDate"
        );
      }
    } catch {
      // 날짜 형식 오류는 개별 날짜 검증에서 보고한다.
    }
  }

  if (!input.asset) {
    addIssue(issues, "error", "ASSET_REQUIRED", "자산 정보가 필요합니다.", "asset");
    questions.push("자산 종류는 주택, 건물, 토지 중 무엇입니까?");
  } else {
    if (!input.asset.domestic) {
      addIssue(issues, "unsupported", "FOREIGN_ASSET_UNSUPPORTED", "국외 자산은 현재 지원하지 않습니다.", "asset.domestic");
    }
  }

  if (!input.ownership) {
    addIssue(issues, "error", "OWNERSHIP_REQUIRED", "소유 형태가 필요합니다.", "ownership");
    questions.push("단독명의입니까, 공동명의입니까? 공동명의라면 각 지분율은 얼마입니까?");
  } else if (input.ownership.type !== "solo" && input.ownership.type !== "joint") {
    addIssue(issues, "error", "OWNERSHIP_TYPE_INVALID", "소유 형태가 올바르지 않습니다.", "ownership.type");
  } else if (input.ownership.type === "joint") {
    const owners = (input.ownership as { owners?: Array<{ sharePercent?: unknown }> }).owners;
    if (!Array.isArray(owners)) {
      addIssue(issues, "error", "JOINT_OWNERS_REQUIRED", "공동명의 소유자 목록이 필요합니다.", "ownership.owners");
    } else {
      if (owners.length < 2) {
        addIssue(issues, "error", "JOINT_OWNER_COUNT_INVALID", "공동명의는 소유자가 2명 이상이어야 합니다.", "ownership.owners");
      }
      const invalidShare = owners.some(
        (owner) =>
          !owner ||
          typeof owner.sharePercent !== "number" ||
          !Number.isFinite(owner.sharePercent) ||
          owner.sharePercent <= 0
      );
      if (invalidShare) {
        addIssue(issues, "error", "JOINT_SHARE_INVALID", "각 지분은 0%보다 큰 숫자여야 합니다.", "ownership.owners");
      } else {
        const totalShare = owners.reduce(
          (sum, owner) => sum + (owner.sharePercent as number),
          0
        );
        if (Math.abs(totalShare - 100) > 0.0001) {
          addIssue(
            issues,
            "error",
            "JOINT_SHARE_SUM_INVALID",
            `공동명의 지분 합계는 100%여야 합니다. 현재 ${totalShare}%입니다.`,
            "ownership.owners"
          );
        }
      }
    }
  }

  if (input.expenses !== undefined) {
    if (!Array.isArray(input.expenses)) {
      addIssue(issues, "error", "EXPENSES_INVALID", "필요경비는 배열이어야 합니다.", "expenses");
    } else {
      input.expenses.forEach((expense, index) => {
        if (expense.type === "other") {
          addIssue(
            issues,
            "unsupported",
            "OTHER_EXPENSE_UNSUPPORTED",
            "기타 필요경비는 적격성 확인 전에는 계산할 수 없습니다.",
            `expenses.${index}.type`
          );
        }
        if (expense.evidenceStatus !== "available") {
          addIssue(
            issues,
            "unsupported",
            "EXPENSE_EVIDENCE_REQUIRED",
            "필요경비는 증빙 보유가 확인된 항목만 계산할 수 있습니다.",
            `expenses.${index}.evidenceStatus`
          );
        }
      });
    }
  }

  if (!input.household) {
    addIssue(issues, "error", "HOUSEHOLD_REQUIRED", "세대 및 주택 정보가 필요합니다.", "household");
    questions.push("세대 주택 수, 거주기간, 조정대상지역 여부, 1세대 1주택 비과세 요청 여부를 확인해 주세요.");
  } else {
    if (
      input.household.oneHouseExemptionClaimed &&
      input.acquisition?.method !== "purchase"
    ) {
      addIssue(
        issues,
        "unsupported",
        "INHERITED_GIFTED_HOME_EXEMPTION_UNSUPPORTED",
        "상속·증여 취득 주택의 1세대1주택 비과세는 현재 자동계산 범위에 포함되지 않습니다.",
        "household.oneHouseExemptionClaimed"
      );
    }
    if (input.household.oneHouseExemptionClaimed) {
      const isHousing =
        input.asset?.subType === "housing" || input.asset?.subType === "housing_1h1h";
      if (!isHousing || input.household.houseCount !== 1) {
        addIssue(
          issues,
          "error",
          "ONE_HOUSE_EXEMPTION_INCONSISTENT",
          "1세대 1주택 비과세는 주택 자산이며 세대 주택 수가 1채인 경우에만 요청할 수 있습니다.",
          "household.oneHouseExemptionClaimed"
        );
      }
      if (
        input.household.exemptionVerificationStatus !==
        "verified_by_tax_professional"
      ) {
        addIssue(
          issues,
          "error",
          "ONE_HOUSE_EXEMPTION_NOT_VERIFIED",
          "1세대 1주택 비과세 요건은 세무전문가 검증 후에만 계산할 수 있습니다.",
          "household.exemptionVerificationStatus"
        );
      }
    }

    if (input.transfer && input.acquisition) {
      try {
        const holdingYears = calculateFullHoldingYears(
          input.acquisition.date,
          input.transfer.date
        );
        if (input.household.residenceYears > holdingYears) {
          addIssue(
            issues,
            "error",
            "RESIDENCE_EXCEEDS_HOLDING_PERIOD",
            "거주기간은 보유기간을 초과할 수 없습니다.",
            "household.residenceYears"
          );
        }
      } catch {
        // 날짜 오류는 개별 날짜 검증에서 보고한다.
      }
    }
  }

  if (!input.annualContext) {
    addIssue(issues, "error", "ANNUAL_CONTEXT_REQUIRED", "동일 연도 다른 양도 여부를 확인해야 합니다.", "annualContext");
    questions.push("같은 연도에 다른 자산을 양도했습니까?");
  } else if (input.annualContext.otherTransfersExist) {
    addIssue(
      issues,
      "unsupported",
      "MULTIPLE_TRANSFERS_UNSUPPORTED",
      "동일 과세기간 복수 양도는 합산·차손통산 검토가 필요하여 현재 지원하지 않습니다.",
      "annualContext.otherTransfersExist"
    );
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasUnsupported = issues.some((issue) => issue.severity === "unsupported");
  const hasWarning = issues.some((issue) => issue.severity === "warning");

  return {
    status: hasUnsupported
      ? "unsupported"
      : hasError
        ? "invalid"
        : hasWarning
          ? "needs_review"
          : "complete",
    validForCalculation: !hasError && !hasUnsupported,
    issues,
    questions: [...new Set(questions)]
  };
}
