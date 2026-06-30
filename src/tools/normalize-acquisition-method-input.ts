import type { StandardNormalizationFields } from "./normalization-result.js";
import { standardFields } from "./normalization-result.js";

export type AcquisitionMethod = "purchase" | "inheritance" | "gift" | "other";

export interface AcquisitionMethodNormalizationResult {
  rawMethod: string;
  method: AcquisitionMethod | null;
  confidence: "high" | "low";
  warnings: string[];
}

type AcquisitionMethodNormalizationOutput =
  AcquisitionMethodNormalizationResult &
    StandardNormalizationFields<AcquisitionMethod>;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeAcquisitionMethodInput(
  rawMethod: string
): AcquisitionMethodNormalizationOutput {
  const value = compact(rawMethod);

  if (!value) {
    return {
      ...standardFields("acquisition.method", null, false),
      rawMethod,
      method: null,
      confidence: "low",
      warnings: ["취득 방법 입력값이 비어 있습니다."]
    };
  }

  if (/상속/.test(value)) {
    return {
      ...standardFields("acquisition.method", "inheritance", true),
      rawMethod,
      method: "inheritance",
      confidence: "high",
      warnings: []
    };
  }
  if (/증여/.test(value)) {
    return {
      ...standardFields("acquisition.method", "gift", true),
      rawMethod,
      method: "gift",
      confidence: "high",
      warnings: []
    };
  }
  if (/매매|구입|취득|매수|매입|샀|구매|분양받/.test(value)) {
    return {
      ...standardFields("acquisition.method", "purchase", true),
      rawMethod,
      method: "purchase",
      confidence: "high",
      warnings: []
    };
  }
  if (/교환|대물|부담부|기타/.test(value)) {
    return {
      ...standardFields("acquisition.method", "other", true),
      rawMethod,
      method: "other",
      confidence: "high",
      warnings: ["기타 취득은 현재 계산 엔진의 지원 범위 밖일 수 있습니다."]
    };
  }

  return {
    ...standardFields("acquisition.method", null, false),
    rawMethod,
    method: null,
    confidence: "low",
    warnings: ["취득 방법을 매매, 상속, 증여, 기타 중 하나로 해석할 수 없습니다."]
  };
}
