import type { StandardNormalizationFields } from "./normalization-result.js";
import { standardFields } from "./normalization-result.js";

export interface BooleanNormalizationResult {
  rawValue: string;
  value: boolean | null;
  normalized: "true" | "false" | "unknown" | null;
  confidence: "high" | "low";
  warnings: string[];
}

type BooleanNormalizationOutput = BooleanNormalizationResult &
  StandardNormalizationFields<boolean>;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeBooleanInput(rawValue: string): BooleanNormalizationOutput {
  const value = compact(rawValue);

  if (!value) {
    return {
      ...standardFields("boolean", null, false),
      rawValue,
      value: null,
      normalized: null,
      confidence: "low",
      warnings: ["예/아니오 입력값이 비어 있습니다."]
    };
  }

  if (/모름|몰라|불명|미확인|확인필요|unknown/i.test(value)) {
    return {
      ...standardFields("boolean", null, false),
      rawValue,
      value: null,
      normalized: "unknown",
      confidence: "high",
      warnings: ["사용자가 확인 불가 또는 모름으로 답했습니다."]
    };
  }

  if (/아니|아님|없음|없어요|해당없|미신청|안함|false|no/i.test(value)) {
    return {
      ...standardFields("boolean", false, true),
      rawValue,
      value: false,
      normalized: "false",
      confidence: "high",
      warnings: []
    };
  }

  if (/네|예|맞|있음|있어요|해당|신청|요청|true|yes/i.test(value)) {
    return {
      ...standardFields("boolean", true, true),
      rawValue,
      value: true,
      normalized: "true",
      confidence: "high",
      warnings: []
    };
  }

  return {
    ...standardFields("boolean", null, false),
    rawValue,
    value: null,
    normalized: null,
    confidence: "low",
    warnings: ["예, 아니오, 모름 중 하나로 해석할 수 없습니다."]
  };
}
