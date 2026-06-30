export interface CountNormalizationResult {
  rawCount: string;
  count: number | null;
  confidence: "high" | "low";
  warnings: string[];
}

const KOREAN_DIGITS: Record<string, number> = {
  영: 0,
  공: 0,
  한: 1,
  하나: 1,
  일: 1,
  두: 2,
  둘: 2,
  이: 2,
  세: 3,
  셋: 3,
  삼: 3,
  네: 4,
  넷: 4,
  사: 4,
  다섯: 5,
  오: 5,
  여섯: 6,
  육: 6,
  일곱: 7,
  칠: 7,
  여덟: 8,
  팔: 8,
  아홉: 9,
  구: 9,
  열: 10,
  십: 10
};

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeCountInput(rawCount: string): CountNormalizationResult {
  const value = compact(rawCount);

  if (!value) {
    return {
      rawCount,
      count: null,
      confidence: "low",
      warnings: ["개수 입력값이 비어 있습니다."]
    };
  }

  if (/없음|없어요|무주택|0채|0개|영채|공채/.test(value)) {
    return { rawCount, count: 0, confidence: "high", warnings: [] };
  }

  const numericMatch = value.match(/(\d+)/);
  if (numericMatch) {
    return {
      rawCount,
      count: Number(numericMatch[1]),
      confidence: "high",
      warnings: []
    };
  }

  for (const [token, count] of Object.entries(KOREAN_DIGITS)) {
    if (value.includes(token)) {
      return { rawCount, count, confidence: "high", warnings: [] };
    }
  }

  return {
    rawCount,
    count: null,
    confidence: "low",
    warnings: ["개수를 해석할 수 없습니다. 예: 1채, 한 채, 두 채, 없음"]
  };
}
