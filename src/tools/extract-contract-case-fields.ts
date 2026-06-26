export interface ExtractedCaseField {
  field: string;
  value: string | number | boolean;
  sourceText: string;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export interface ContractCaseExtractionResult {
  partialCaseData: Record<string, unknown>;
  extractedFields: ExtractedCaseField[];
  unresolvedFields: string[];
  questions: string[];
  warnings: string[];
}

type ContractDocumentType = "transfer" | "acquisition" | "unknown";

const DATE_VALUE =
  "(\\d{4})\\s*(?:년|[.\\-/])\\s*(\\d{1,2})\\s*(?:월|[.\\-/])\\s*(\\d{1,2})\\s*(?:일)?";

const TRANSFER_DATE_LABELS = [
  "양도일",
  "양도계약일",
  "매도일",
  "잔금일",
  "거래일"
];

const ACQUISITION_DATE_LABELS = [
  "취득일",
  "취득계약일",
  "매수일",
  "매입일"
];

const GENERIC_DATE_LABELS = ["계약일", "매매일"];

const TRANSFER_PRICE_LABELS = [
  "양도가액",
  "양도금액",
  "매도금액"
];

const ACQUISITION_PRICE_LABELS = [
  "취득가액",
  "취득금액",
  "매수금액",
  "매입금액"
];

const GENERIC_PRICE_LABELS = ["매매대금", "매매금액", "거래금액"];

function makeLabelPattern(labels: string[], valuePattern: string): RegExp {
  return new RegExp(
    `(${labels.map((label) => label.replace(/\s+/g, "\\s*")).join("|")})\\s*[:：]?\\s*${valuePattern}`,
    "g"
  );
}

function toIsoDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseMoneyAmount(rawAmount: string, rawUnit: string | undefined): number {
  const numeric = Number(rawAmount.replace(/[,\s]/g, ""));
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (rawUnit === "억원") {
    return Math.round(numeric * 100_000_000);
  }
  if (rawUnit === "만원") {
    return Math.round(numeric * 10_000);
  }
  return Math.round(numeric);
}

function setNested(
  target: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function getNested(target: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, part) => {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    return (cursor as Record<string, unknown>)[part];
  }, target);
}

function addField(
  partialCaseData: Record<string, unknown>,
  extractedFields: ExtractedCaseField[],
  field: string,
  value: string | number | boolean,
  sourceText: string,
  confidence: ExtractedCaseField["confidence"],
  note?: string
): void {
  if (getNested(partialCaseData, field) === undefined) {
    setNested(partialCaseData, field, value);
  }
  extractedFields.push({ field, value, sourceText, confidence, ...(note ? { note } : {}) });
}

function extractDateByLabels(
  text: string,
  labels: string[],
  field: string,
  partialCaseData: Record<string, unknown>,
  extractedFields: ExtractedCaseField[],
  confidence: ExtractedCaseField["confidence"],
  note?: string
): void {
  const pattern = makeLabelPattern(labels, DATE_VALUE);
  const match = pattern.exec(text);
  if (!match) {
    return;
  }
  addField(
    partialCaseData,
    extractedFields,
    field,
    toIsoDate(match[2], match[3], match[4]),
    match[0],
    confidence,
    note
  );
}

function extractPriceByLabels(
  text: string,
  labels: string[],
  field: string,
  partialCaseData: Record<string, unknown>,
  extractedFields: ExtractedCaseField[],
  confidence: ExtractedCaseField["confidence"],
  note?: string
): void {
  const amountValue = "([0-9][0-9,\\s]*(?:\\.\\d+)?)\\s*(원|만원|억원)?";
  const pattern = makeLabelPattern(labels, amountValue);
  const match = pattern.exec(text);
  if (!match) {
    return;
  }
  const amount = parseMoneyAmount(match[2], match[3]);
  if (amount <= 0) {
    return;
  }
  addField(
    partialCaseData,
    extractedFields,
    field,
    amount,
    match[0],
    confidence,
    note
  );
}

function extractAssetSubtype(
  text: string,
  partialCaseData: Record<string, unknown>,
  extractedFields: ExtractedCaseField[]
): void {
  const candidates: Array<{
    pattern: RegExp;
    value: string;
    source: string;
    note?: string;
  }> = [
    {
      pattern: /(아파트|주택|연립|다세대|다가구)/,
      value: "housing",
      source: "주택"
    },
    {
      pattern: /(토지|대지|임야|전답)/,
      value: "land_business",
      source: "토지",
      note: "사업용 여부는 계약서만으로 확정하기 어려워 체크리스트에서 추가 확인합니다."
    },
    {
      pattern: /(상가|건물|근린생활시설|오피스텔)/,
      value: "building",
      source: "건물"
    }
  ];

  for (const candidate of candidates) {
    const match = candidate.pattern.exec(text);
    if (!match) {
      continue;
    }
    addField(
      partialCaseData,
      extractedFields,
      "asset.subType",
      candidate.value,
      match[0] || candidate.source,
      candidate.note ? "medium" : "high",
      candidate.note
    );
    return;
  }
}

function extractAcquisitionMethod(
  text: string,
  partialCaseData: Record<string, unknown>,
  extractedFields: ExtractedCaseField[]
): void {
  const candidates: Array<[RegExp, string]> = [
    [/(상속)/, "inheritance"],
    [/(증여)/, "gift"],
    [/(매매|매수|매입)/, "purchase"]
  ];

  for (const [pattern, value] of candidates) {
    const match = pattern.exec(text);
    if (!match) {
      continue;
    }
    addField(
      partialCaseData,
      extractedFields,
      "acquisition.method",
      value,
      match[0],
      value === "purchase" ? "medium" : "high"
    );
    return;
  }
}

export function extractContractCaseFields(
  sanitizedContractText: string,
  documentType: ContractDocumentType = "unknown"
): ContractCaseExtractionResult {
  const partialCaseData: Record<string, unknown> = {};
  const extractedFields: ExtractedCaseField[] = [];
  const warnings: string[] = [];

  extractDateByLabels(
    sanitizedContractText,
    TRANSFER_DATE_LABELS,
    "transfer.date",
    partialCaseData,
    extractedFields,
    "high"
  );
  extractDateByLabels(
    sanitizedContractText,
    ACQUISITION_DATE_LABELS,
    "acquisition.date",
    partialCaseData,
    extractedFields,
    "high"
  );
  extractPriceByLabels(
    sanitizedContractText,
    TRANSFER_PRICE_LABELS,
    "transfer.price",
    partialCaseData,
    extractedFields,
    documentType === "acquisition" ? "low" : "medium"
  );
  extractPriceByLabels(
    sanitizedContractText,
    ACQUISITION_PRICE_LABELS,
    "acquisition.price",
    partialCaseData,
    extractedFields,
    documentType === "transfer" ? "low" : "medium"
  );

  if (documentType === "transfer") {
    extractDateByLabels(
      sanitizedContractText,
      GENERIC_DATE_LABELS,
      "transfer.date",
      partialCaseData,
      extractedFields,
      "medium",
      "문서 유형이 양도계약서로 지정되어 일반 계약일을 양도일 후보로 사용했습니다."
    );
    extractPriceByLabels(
      sanitizedContractText,
      GENERIC_PRICE_LABELS,
      "transfer.price",
      partialCaseData,
      extractedFields,
      "medium",
      "문서 유형이 양도계약서로 지정되어 일반 매매대금을 양도가액 후보로 사용했습니다."
    );
  } else if (documentType === "acquisition") {
    extractDateByLabels(
      sanitizedContractText,
      GENERIC_DATE_LABELS,
      "acquisition.date",
      partialCaseData,
      extractedFields,
      "medium",
      "문서 유형이 취득계약서로 지정되어 일반 계약일을 취득일 후보로 사용했습니다."
    );
    extractPriceByLabels(
      sanitizedContractText,
      GENERIC_PRICE_LABELS,
      "acquisition.price",
      partialCaseData,
      extractedFields,
      "medium",
      "문서 유형이 취득계약서로 지정되어 일반 매매대금을 취득가액 후보로 사용했습니다."
    );
  } else {
    const genericDatePattern = makeLabelPattern(GENERIC_DATE_LABELS, DATE_VALUE);
    if (genericDatePattern.test(sanitizedContractText)) {
      warnings.push(
        "계약일은 확인했지만 양도계약서인지 취득계약서인지 알 수 없어 날짜 필드에 자동 배정하지 않았습니다."
      );
    }
    const genericPricePattern = makeLabelPattern(
      GENERIC_PRICE_LABELS,
      "([0-9][0-9,\\s]*(?:\\.\\d+)?)\\s*(원|만원|억원)?"
    );
    if (genericPricePattern.test(sanitizedContractText)) {
      warnings.push(
        "매매대금은 확인했지만 양도계약서인지 취득계약서인지 알 수 없어 금액 필드에 자동 배정하지 않았습니다."
      );
    }
  }

  extractAssetSubtype(sanitizedContractText, partialCaseData, extractedFields);
  extractAcquisitionMethod(sanitizedContractText, partialCaseData, extractedFields);

  const unresolvedFields = [
    "ruleDate",
    "transfer.date",
    "transfer.price",
    "acquisition.date",
    "acquisition.price",
    "acquisition.method",
    "asset.subType",
    "ownership",
    "household.houseCount",
    "household.residenceYears",
    "household.isAdjustedArea",
    "household.oneHouseExemptionClaimed",
    "household.exemptionVerificationStatus",
    "annualContext.otherTransfersExist"
  ].filter((field) => getNested(partialCaseData, field) === undefined);

  const questions = unresolvedFields.map((field) => {
    const questionByField: Record<string, string> = {
      ruleDate: "어느 기준일의 세법으로 계산할까요?",
      "transfer.date": "양도일 또는 양도 잔금일은 언제입니까?",
      "transfer.price": "양도가액은 얼마입니까?",
      "acquisition.date": "취득일 또는 취득 잔금일은 언제입니까?",
      "acquisition.price": "취득가액은 얼마입니까?",
      "acquisition.method": "취득 방법은 매매, 상속, 증여 중 무엇입니까?",
      "asset.subType": "자산 종류는 주택, 건물, 토지 중 무엇입니까?",
      ownership: "단독명의입니까, 공동명의입니까? 공동명의라면 각 지분율은 얼마입니까?",
      "household.houseCount": "양도일 현재 세대 기준 주택 수는 몇 채입니까?",
      "household.residenceYears": "해당 주택의 거주기간은 몇 년입니까?",
      "household.isAdjustedArea": "취득 또는 보유 기간 중 조정대상지역 해당 여부를 확인했습니까?",
      "household.oneHouseExemptionClaimed": "1세대 1주택 비과세 적용을 요청합니까?",
      "household.exemptionVerificationStatus": "비과세 요건은 세무전문가가 검증했습니까?",
      "annualContext.otherTransfersExist": "같은 과세연도에 다른 자산 양도가 있습니까?"
    };
    return questionByField[field] ?? `${field} 값을 확인해 주세요.`;
  });

  if (extractedFields.length === 0) {
    warnings.push(
      "계약서 텍스트에서 계산 입력값을 자동 추출하지 못했습니다. OCR 품질 또는 레이블 표기를 확인하세요."
    );
  }

  return {
    partialCaseData,
    extractedFields,
    unresolvedFields,
    questions,
    warnings
  };
}
