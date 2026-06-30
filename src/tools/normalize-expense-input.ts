import type { ExpenseInput } from "../domain/types.js";
import { normalizeAmountInput } from "./normalize-amount-input.js";

export interface ExpenseNormalizationResult {
  rawExpense: string;
  expense: ExpenseInput | null;
  confidence: "high" | "low";
  warnings: string[];
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function classifyExpense(value: string): ExpenseInput["type"] {
  if (/취득세|등록세/.test(value)) return "acquisition_tax";
  if (/복비|중개수수료|공인중개|중개료/.test(value)) return "brokerage_fee";
  if (/법무사|등기비|등기수수료/.test(value)) return "legal_fee";
  if (/인테리어|샷시|새시|리모델|증축|개축|자본적/.test(value)) return "capital_expenditure";
  if (/양도비|매도중개|양도중개|광고비|측량비/.test(value)) return "transfer_cost";
  return "other";
}

function detectEvidenceStatus(value: string): ExpenseInput["evidenceStatus"] {
  if (/증빙없|영수증없|자료없|없음/.test(value)) return "missing";
  if (/증빙있|영수증있|자료있|계산서|세금계산서|있음/.test(value)) return "available";
  return "unknown";
}

function extractAmountToken(rawExpense: string): string | null {
  const patterns = [
    /\d+(?:\.\d+)?\s*억\s*\d*(?:천|백|십)?\s*만?/,
    /\d+\s*(?:천|백|십)?\s*만원/,
    /\d[\d,]*\s*원/,
    /\d[\d,]{3,}/
  ];

  for (const pattern of patterns) {
    const match = rawExpense.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

export function normalizeExpenseInput(
  rawExpense: string
): ExpenseNormalizationResult {
  const value = compact(rawExpense);
  const warnings: string[] = [];

  if (!value) {
    return {
      rawExpense,
      expense: null,
      confidence: "low",
      warnings: ["필요경비 입력값이 비어 있습니다."]
    };
  }

  const type = classifyExpense(value);
  const amountToken = extractAmountToken(rawExpense);
  const normalizedAmount = amountToken ? normalizeAmountInput(amountToken) : null;
  const evidenceStatus = detectEvidenceStatus(value);

  if (type === "other") {
    warnings.push("필요경비 종류를 지원 항목으로 명확히 분류하지 못했습니다.");
  }
  if (!normalizedAmount?.amount) {
    warnings.push("필요경비 금액을 해석하지 못했습니다.");
  }
  if (evidenceStatus !== "available") {
    warnings.push("필요경비는 증빙 보유가 확인된 항목만 계산에 반영할 수 있습니다.");
  }

  const expense: ExpenseInput = {
    type,
    amount: normalizedAmount?.amount ?? 0,
    evidenceStatus,
    description: rawExpense
  };

  return {
    rawExpense,
    expense,
    confidence: warnings.length > 0 ? "low" : "high",
    warnings
  };
}
