import type { StandardNormalizationFields } from "./normalization-result.js";
import { standardFields } from "./normalization-result.js";

export interface DurationNormalizationResult {
  rawDuration: string;
  residenceYears: number | null;
  totalMonths: number | null;
  confidence: "high" | "low";
  warnings: string[];
}

type DurationNormalizationOutput = DurationNormalizationResult &
  StandardNormalizationFields<number>;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeDurationInput(
  rawDuration: string
): DurationNormalizationOutput {
  const value = compact(rawDuration);
  const warnings: string[] = [];

  if (!value) {
    return {
      ...standardFields("household.residenceYears", null, false),
      rawDuration,
      residenceYears: null,
      totalMonths: null,
      confidence: "low",
      warnings: ["거주기간 입력값이 비어 있습니다."]
    };
  }

  if (/거주안함|실거주없|안살|없음/.test(value) || /^(0년|0개월|0)$/.test(value)) {
    return {
      ...standardFields("household.residenceYears", 0, true),
      rawDuration,
      residenceYears: 0,
      totalMonths: 0,
      confidence: "high",
      warnings
    };
  }

  const yearMatch = value.match(/(\d+)\s*년/);
  const monthMatch = value.match(/(\d+)\s*개월/);
  const plainYearMatch = value.match(/^(\d+)$/);

  const years = yearMatch ? Number(yearMatch[1]) : plainYearMatch ? Number(plainYearMatch[1]) : 0;
  const months = monthMatch ? Number(monthMatch[1]) : 0;

  if (!yearMatch && !monthMatch && !plainYearMatch) {
    return {
      ...standardFields("household.residenceYears", null, false),
      rawDuration,
      residenceYears: null,
      totalMonths: null,
      confidence: "low",
      warnings: ["거주기간을 2년, 2년 6개월, 30개월 같은 형식으로 해석할 수 없습니다."]
    };
  }

  const totalMonths = years * 12 + months;
  const residenceYears = Math.floor(totalMonths / 12);
  if (months > 0) {
    warnings.push("계산 스키마는 정수 연 단위라 개월 수는 내림하여 residenceYears에 반영했습니다.");
  }

  return {
    ...standardFields("household.residenceYears", residenceYears, warnings.length === 0),
    rawDuration,
    residenceYears,
    totalMonths,
    confidence: warnings.length > 0 ? "low" : "high",
    warnings
  };
}
