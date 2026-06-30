import type { StandardNormalizationFields } from "./normalization-result.js";
import { standardFields } from "./normalization-result.js";

export interface DateNormalizationResult {
  rawDate: string;
  kind: "single" | "range" | "invalid";
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  dates: string[];
  confidence: "high" | "low";
  warnings: string[];
}

type DateNormalizedValue =
  | string
  | {
      startDate: string;
      endDate: string;
    };

type DateNormalizationOutput = DateNormalizationResult &
  StandardNormalizationFields<DateNormalizedValue>;

const DATE_TOKEN_PATTERN =
  /(\d{4})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?|\b(\d{4})(\d{2})(\d{2})\b|\b(\d{2})(\d{2})(\d{2})\b/g;

function twoDigitYearToFullYear(value: string): number {
  const year = Number(value);
  return year >= 70 ? 1900 + year : 2000 + year;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compareIsoDates(left: string, right: string): number {
  return Math.sign(left.localeCompare(right));
}

function extractDates(rawDate: string): { dates: string[]; invalidTokens: string[] } {
  const dates: string[] = [];
  const invalidTokens: string[] = [];

  for (const match of rawDate.matchAll(DATE_TOKEN_PATTERN)) {
    let year: number;
    let month: number;
    let day: number;

    if (match[1]) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else if (match[4]) {
      year = Number(match[4]);
      month = Number(match[5]);
      day = Number(match[6]);
    } else {
      year = twoDigitYearToFullYear(match[7]);
      month = Number(match[8]);
      day = Number(match[9]);
    }

    const isoDate = toIsoDate(year, month, day);
    if (isoDate) {
      dates.push(isoDate);
    } else {
      invalidTokens.push(match[0]);
    }
  }

  return { dates, invalidTokens };
}

export function normalizeDateInput(rawDate: string): DateNormalizationOutput {
  const warnings: string[] = [];
  const { dates, invalidTokens } = extractDates(rawDate);

  if (invalidTokens.length > 0) {
    warnings.push(`존재하지 않는 날짜가 포함되어 있습니다: ${invalidTokens.join(", ")}`);
  }

  if (dates.length === 0) {
    return {
      ...standardFields("date", null, false),
      rawDate,
      kind: "invalid",
      date: null,
      startDate: null,
      endDate: null,
      dates: [],
      confidence: "low",
      warnings:
        warnings.length > 0
          ? warnings
          : ["날짜를 해석할 수 없습니다. 예: 2026-01-01, 260101, 20260101"]
    };
  }

  if (dates.length === 1) {
    return {
      ...standardFields("date", dates[0], true),
      rawDate,
      kind: "single",
      date: dates[0],
      startDate: dates[0],
      endDate: null,
      dates,
      confidence: warnings.length > 0 ? "low" : "high",
      warnings
    };
  }

  const startDate = dates[0];
  const endDate = dates[1];
  if (compareIsoDates(startDate, endDate) > 0) {
    warnings.push("시작일이 종료일보다 늦습니다. 날짜 순서를 확인해 주세요.");
  }
  if (dates.length > 2) {
    warnings.push("날짜가 3개 이상 감지되어 앞의 두 날짜만 기간으로 사용했습니다.");
  }

  return {
    ...standardFields(
      "dateRange",
      {
        startDate,
        endDate
      },
      warnings.length === 0
    ),
    rawDate,
    kind: "range",
    date: null,
    startDate,
    endDate,
    dates,
    confidence: warnings.length > 0 ? "low" : "high",
    warnings
  };
}
