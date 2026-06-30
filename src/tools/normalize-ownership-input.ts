import type { OwnerInput } from "../domain/types.js";

export type NormalizedOwnership =
  | { type: "solo"; basicDeductionAlreadyUsed?: number }
  | { type: "joint"; owners: OwnerInput[] };

export interface OwnershipNormalizationResult {
  rawOwnership: string;
  ownership: NormalizedOwnership | null;
  confidence: "high" | "low";
  warnings: string[];
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function makeJointOwnership(shares: number[]): NormalizedOwnership {
  return {
    type: "joint",
    owners: shares.map((sharePercent, index) => ({
      ownerId: `owner${index + 1}`,
      sharePercent
    }))
  };
}

function extractShares(value: string): number[] {
  const percentShares = [...value.matchAll(/(\d+(?:\.\d+)?)%/g)].map((match) =>
    Number(match[1])
  );
  if (percentShares.length >= 2) {
    return percentShares;
  }

  const ratioMatch = value.match(/(\d+(?:\.\d+)?)(?:대|:)(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    return [Number(ratioMatch[1]), Number(ratioMatch[2])];
  }

  const numbers = [...value.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((number) => number > 0 && number <= 100);
  return numbers.length >= 2 ? numbers : [];
}

export function normalizeOwnershipInput(
  rawOwnership: string
): OwnershipNormalizationResult {
  const value = compact(rawOwnership);
  const warnings: string[] = [];

  if (!value) {
    return {
      rawOwnership,
      ownership: null,
      confidence: "low",
      warnings: ["소유 형태 입력값이 비어 있습니다."]
    };
  }

  if (/단독|혼자|본인100|1인|개인명의/.test(value)) {
    return { rawOwnership, ownership: { type: "solo" }, confidence: "high", warnings };
  }

  if (/반반|절반|50대50|50:50/.test(value)) {
    return {
      rawOwnership,
      ownership: makeJointOwnership([50, 50]),
      confidence: "high",
      warnings
    };
  }

  if (/공동|부부|배우자|지분|명의/.test(value)) {
    const shares = extractShares(value);
    if (shares.length >= 2) {
      const totalShare = shares.reduce((sum, share) => sum + share, 0);
      if (Math.abs(totalShare - 100) > 0.0001) {
        warnings.push(`공동명의 지분 합계가 100%가 아닙니다. 현재 ${totalShare}%입니다.`);
      }
      return {
        rawOwnership,
        ownership: makeJointOwnership(shares),
        confidence: warnings.length > 0 ? "low" : "high",
        warnings
      };
    }

    warnings.push("공동명의로 해석했지만 지분율은 명확하지 않아 50:50으로 임시 정규화했습니다.");
    return {
      rawOwnership,
      ownership: makeJointOwnership([50, 50]),
      confidence: "low",
      warnings
    };
  }

  return {
    rawOwnership,
    ownership: null,
    confidence: "low",
    warnings: ["소유 형태를 단독명의 또는 공동명의로 해석할 수 없습니다."]
  };
}
