import type { AssetSubType } from "../domain/types.js";

export interface AssetNormalizationResult {
  rawAsset: string;
  assetSubType: AssetSubType | null;
  candidates: AssetSubType[];
  confidence: "high" | "low";
  warnings: string[];
}

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeAssetInput(rawAsset: string): AssetNormalizationResult {
  const value = compact(rawAsset);
  const warnings: string[] = [];

  if (!value) {
    return {
      rawAsset,
      assetSubType: null,
      candidates: [],
      confidence: "low",
      warnings: ["자산 종류 입력값이 비어 있습니다."]
    };
  }

  if (/분양권|입주권/.test(value)) {
    return {
      rawAsset,
      assetSubType: null,
      candidates: [],
      confidence: "low",
      warnings: ["분양권과 조합원입주권은 현재 계산 엔진의 지원 범위 밖입니다."]
    };
  }

  if (/1세대1주택|1가구1주택/.test(value)) {
    return {
      rawAsset,
      assetSubType: "housing_1h1h",
      candidates: ["housing_1h1h"],
      confidence: "high",
      warnings
    };
  }

  if (/아파트|주택|빌라|연립|다세대|다가구|단독주택/.test(value)) {
    return {
      rawAsset,
      assetSubType: "housing",
      candidates: ["housing"],
      confidence: "high",
      warnings
    };
  }

  if (/오피스텔|상가|건물|근린생활시설|사무실/.test(value)) {
    if (/오피스텔/.test(value)) {
      warnings.push("오피스텔은 실제 용도에 따라 주택 판단이 달라질 수 있어 추가 확인이 필요합니다.");
    }
    return {
      rawAsset,
      assetSubType: "building",
      candidates: ["building"],
      confidence: warnings.length > 0 ? "low" : "high",
      warnings
    };
  }

  if (/토지|대지|임야|농지|전답|논|밭/.test(value)) {
    if (/조정.*비사업|비사업.*조정/.test(value)) {
      return {
        rawAsset,
        assetSubType: "land_nonbusiness_adj",
        candidates: ["land_nonbusiness_adj"],
        confidence: "high",
        warnings
      };
    }
    if (/비사업/.test(value)) {
      return {
        rawAsset,
        assetSubType: "land_nonbusiness",
        candidates: ["land_nonbusiness"],
        confidence: "high",
        warnings
      };
    }
    if (/사업용/.test(value)) {
      return {
        rawAsset,
        assetSubType: "land_business",
        candidates: ["land_business"],
        confidence: "high",
        warnings
      };
    }

    return {
      rawAsset,
      assetSubType: null,
      candidates: ["land_business", "land_nonbusiness", "land_nonbusiness_adj"],
      confidence: "low",
      warnings: ["토지는 사업용·비사업용 여부와 조정대상지역 여부를 추가로 확인해야 합니다."]
    };
  }

  return {
    rawAsset,
    assetSubType: null,
    candidates: [],
    confidence: "low",
    warnings: ["자산 종류를 주택, 건물, 사업용 토지, 비사업용 토지 중 하나로 해석할 수 없습니다."]
  };
}
