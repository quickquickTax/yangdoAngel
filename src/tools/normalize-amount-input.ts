import type { StandardNormalizationFields } from "./normalization-result.js";
import { standardFields } from "./normalization-result.js";

export interface AmountNormalizationResult {
  rawAmount: string;
  amount: number | null;
  displayAmount: string | null;
  confidence: "high" | "low";
  warnings: string[];
}

type AmountNormalizationOutput = AmountNormalizationResult &
  StandardNormalizationFields<number>;

const EOK = 100_000_000;
const MAN = 10_000;

function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function normalizeText(rawAmount: string): string {
  return rawAmount
    .trim()
    .replace(/[,\s]/g, "")
    .replace(/[₩원]/g, "")
    .replace(/^(약|대략| approximately)/i, "")
    .replace(/(정도|가량|예상)$/g, "");
}

function parseSmallKoreanNumber(value: string): number | null {
  if (!value) {
    return 0;
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  let total = 0;
  let rest = value;
  const unitPattern = /(\d+(?:\.\d+)?)(천|백|십)/g;
  for (const match of rest.matchAll(unitPattern)) {
    const numeric = Number(match[1]);
    const unit = match[2] === "천" ? 1000 : match[2] === "백" ? 100 : 10;
    total += numeric * unit;
  }
  rest = rest.replace(unitPattern, "");

  if (rest) {
    if (!/^\d+(?:\.\d+)?$/.test(rest)) {
      return null;
    }
    total += Number(rest);
  }

  return total;
}

function parseUnitAmount(value: string): number | null {
  let rest = value;
  let total = 0;

  const eokMatch = rest.match(/^(\d+(?:\.\d+)?)억/);
  if (eokMatch) {
    total += Number(eokMatch[1]) * EOK;
    rest = rest.slice(eokMatch[0].length);
  }

  const manIndex = rest.indexOf("만");
  if (manIndex >= 0) {
    const manPart = rest.slice(0, manIndex);
    const parsedMan = parseSmallKoreanNumber(manPart);
    if (parsedMan === null) {
      return null;
    }
    total += parsedMan * MAN;
    rest = rest.slice(manIndex + 1);
  }

  if (rest) {
    const parsedRest = parseSmallKoreanNumber(rest);
    if (parsedRest === null) {
      return null;
    }
    total += parsedRest;
  }

  return total > 0 ? total : null;
}

export function normalizeAmountInput(
  rawAmount: string
): AmountNormalizationOutput {
  const warnings: string[] = [];
  const normalized = normalizeText(rawAmount);

  if (!normalized) {
    return {
      ...standardFields("amount", null, false),
      rawAmount,
      amount: null,
      displayAmount: null,
      confidence: "low",
      warnings: ["금액 입력값이 비어 있습니다."]
    };
  }

  let parsed: number | null = null;

  if (/^\d+$/.test(normalized)) {
    parsed = Number(normalized);
  } else if (/[억만천백십]/.test(normalized)) {
    parsed = parseUnitAmount(normalized);
  } else {
    warnings.push("원 단위 숫자 또는 억·만 단위 금액 표현으로 입력해 주세요.");
  }

  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
    return {
      ...standardFields("amount", null, false),
      rawAmount,
      amount: null,
      displayAmount: null,
      confidence: "low",
      warnings: warnings.length > 0 ? warnings : ["금액을 해석할 수 없습니다."]
    };
  }

  const amount = Math.round(parsed);
  if (!Number.isSafeInteger(amount)) {
    return {
      ...standardFields("amount", null, false),
      rawAmount,
      amount: null,
      displayAmount: null,
      confidence: "low",
      warnings: ["금액이 안전한 정수 범위를 초과했습니다."]
    };
  }

  return {
    ...standardFields("amount", amount, true),
    rawAmount,
    amount,
    displayAmount: formatWon(amount),
    confidence: "high",
    warnings
  };
}
