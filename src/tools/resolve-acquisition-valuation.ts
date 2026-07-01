import { XMLParser } from "fast-xml-parser";
import type { AcquisitionValuation, ValuationBasis } from "../domain/types.js";

export type PropertyValuationType =
  | "apartment"
  | "row_house"
  | "detached_house"
  | "land"
  | "officetel"
  | "commercial_building"
  | "general_building";

export interface KnownValuationEvidence {
  amount: number;
  basis: ValuationBasis;
  status: "reported" | "determined" | "corrected" | "user_confirmed";
  referenceDate: string;
  sourceUrl?: string;
  sourceId?: string;
  appraisalDetails?: AcquisitionValuation["appraisalDetails"];
  similarPropertyMatch?: AcquisitionValuation["similarPropertyMatch"];
}

export interface PropertyValuationQuery {
  acquisitionMethod: "inheritance" | "gift";
  acquisitionDate: string;
  property: {
    type: PropertyValuationType;
    address: string;
    legalDistrictCode?: string;
    pnu?: string;
    lotNumber?: string;
    complexName?: string;
    exclusiveAreaSquareMeters?: number;
    unitName?: string;
  };
  knownEvidence?: KnownValuationEvidence[];
}

export interface ValuationCandidate {
  amount: number;
  basis: ValuationBasis;
  referenceDate: string;
  sourceUrl: string;
  sourceId?: string;
  confidence: "high" | "medium" | "low";
  selectionReason: string;
  authorityRank: number;
  appraisalDetails?: AcquisitionValuation["appraisalDetails"];
  similarPropertyMatch?: AcquisitionValuation["similarPropertyMatch"];
}

export interface AcquisitionValuationResolution {
  status: "resolved" | "needs_user_confirmation";
  evaluationWindow: { from: string; to: string };
  candidates: ValuationCandidate[];
  selectedValuation: AcquisitionValuation | null;
  selectionReason: string | null;
  confirmationLinks: Array<{ label: string; url: string; searchGuide: string }>;
  caseDataPatch: Record<string, unknown> | null;
  warnings: string[];
  resolvedProperty: PropertyValuationQuery["property"];
}

const TRANSACTION_ENDPOINTS: Record<PropertyValuationType, string | null> = {
  apartment: "RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
  row_house: "RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  detached_house: "RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade",
  land: "RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade",
  officetel: "RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade",
  commercial_building: "RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade",
  general_building: "RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade"
};

const VWORLD_DATASET_ENV: Record<PropertyValuationType, string> = {
  apartment: "VWORLD_DATASET_APARTMENT_PRICE",
  row_house: "VWORLD_DATASET_APARTMENT_PRICE",
  detached_house: "VWORLD_DATASET_INDIVIDUAL_HOUSE_PRICE",
  land: "VWORLD_DATASET_INDIVIDUAL_LAND_PRICE",
  officetel: "VWORLD_DATASET_COMMERCIAL_STANDARD_PRICE",
  commercial_building: "VWORLD_DATASET_COMMERCIAL_STANDARD_PRICE",
  general_building: "VWORLD_DATASET_BUILDING_STANDARD_PRICE"
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const date = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))
  );
  return isoDate(date);
}

export function getEvaluationWindow(
  method: "inheritance" | "gift",
  acquisitionDate: string
): { from: string; to: string } {
  return {
    from: addMonths(acquisitionDate, -6),
    to: addMonths(acquisitionDate, method === "inheritance" ? 6 : 3)
  };
}

function monthsInWindow(from: string, to: string): string[] {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  const result: string[] = [];
  let year = fromYear;
  let month = fromMonth;
  while (year < toYear || (year === toYear && month <= toMonth)) {
    result.push(`${year}${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return result;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function nestedItems(payload: unknown): Array<Record<string, unknown>> {
  const root = payload as Record<string, any>;
  return asArray(
    root?.response?.body?.items?.item ??
      root?.response?.body?.item ??
      root?.body?.items?.item
  );
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9.-]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  // 국토부 실거래가의 거래금액 단위는 만원이다.
  return Math.round(parsed * 10_000);
}

function transactionDate(item: Record<string, unknown>): string | null {
  const year = Number(item.dealYear ?? item["년"]);
  const month = Number(item.dealMonth ?? item["월"]);
  const day = Number(item.dealDay ?? item["일"]);
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isCancelled(item: Record<string, unknown>): boolean {
  const value = item.cdealType ?? item["해제여부"];
  return value === "O" || value === "1" || value === 1 || value === true;
}

function exactPropertyMatch(
  item: Record<string, unknown>,
  property: PropertyValuationQuery["property"]
): boolean {
  const name = String(item.aptNm ?? item.houseType ?? item["아파트"] ?? item["단지"] ?? "");
  const lotNumber = String(item.jibun ?? item["지번"] ?? "");
  if (property.complexName) {
    if (!name || !name.includes(property.complexName)) return false;
  } else if (property.lotNumber) {
    if (!lotNumber || lotNumber !== property.lotNumber) return false;
  } else {
    return false;
  }
  const area = Number(item.excluUseAr ?? item.totalFloorAr ?? item["전용면적"] ?? item["연면적"]);
  if (property.exclusiveAreaSquareMeters && Number.isFinite(area)) {
    return Math.abs(area - property.exclusiveAreaSquareMeters) < 0.01;
  }
  return true;
}

async function fetchPayload(url: URL, timeoutMs = 5_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`공공 API 응답 오류: HTTP ${response.status}`);
  const text = await response.text();
  if (text.trim().startsWith("{")) return JSON.parse(text);
  return new XMLParser({ ignoreAttributes: false }).parse(text);
}

function pnuFromAddress(admCd: string, jibunAddress: string): { pnu?: string; lotNumber?: string } {
  const match = jibunAddress.match(/(산\s*)?(\d+)(?:-(\d+))?\s*$/);
  if (!match || !/^\d{10}$/.test(admCd)) return {};
  const lotNumber = `${match[2]}${match[3] ? `-${match[3]}` : ""}`;
  const pnu = `${admCd}${match[1] ? "2" : "1"}${match[2].padStart(4, "0")}${(match[3] ?? "0").padStart(4, "0")}`;
  return { pnu, lotNumber };
}

async function resolvePropertyAddress(
  property: PropertyValuationQuery["property"]
): Promise<PropertyValuationQuery["property"]> {
  if (property.legalDistrictCode && property.pnu) return property;
  const key = process.env.JUSO_API_KEY;
  if (!key) return property;
  const url = new URL("https://business.juso.go.kr/addrlink/addrLinkApi.do");
  url.searchParams.set("confmKey", key);
  url.searchParams.set("currentPage", "1");
  url.searchParams.set("countPerPage", "10");
  url.searchParams.set("keyword", property.address);
  url.searchParams.set("resultType", "json");
  const payload = (await fetchPayload(url)) as Record<string, any>;
  const result = asArray(payload?.results?.juso)[0];
  if (!result) return property;
  const admCd = String(result.admCd ?? "");
  const jibunAddress = String(result.jibunAddr ?? "");
  const derived = pnuFromAddress(admCd, jibunAddress);
  return {
    ...property,
    legalDistrictCode: property.legalDistrictCode ?? admCd.slice(0, 5),
    pnu: property.pnu ?? derived.pnu,
    lotNumber: property.lotNumber ?? derived.lotNumber
  };
}

async function getTransactionCandidates(
  query: PropertyValuationQuery,
  window: { from: string; to: string }
): Promise<ValuationCandidate[]> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  const endpoint = TRANSACTION_ENDPOINTS[query.property.type];
  const districtCode = query.property.legalDistrictCode;
  if (!serviceKey || !endpoint || !districtCode) return [];

  const candidates: ValuationCandidate[] = [];
  for (const month of monthsInWindow(window.from, window.to)) {
    const url = new URL(`https://apis.data.go.kr/1613000/${endpoint}`);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("LAWD_CD", districtCode);
    url.searchParams.set("DEAL_YMD", month);
    url.searchParams.set("numOfRows", "1000");
    url.searchParams.set("pageNo", "1");
    const payload = await fetchPayload(url);
    for (const item of nestedItems(payload)) {
      if (isCancelled(item) || !exactPropertyMatch(item, query.property)) continue;
      const amount = parseAmount(item.dealAmount ?? item["거래금액"]);
      const date = transactionDate(item);
      if (!amount || !date || date < window.from || date > window.to) continue;
      const isCollectiveHousing =
        query.property.type === "apartment" ||
        query.property.type === "row_house" ||
        query.property.type === "officetel";
      candidates.push({
        amount,
        basis: isCollectiveHousing ? "similar_transaction" : "own_transaction",
        referenceDate: date,
        sourceUrl: "https://rt.molit.go.kr/",
        confidence: isCollectiveHousing ? "low" : "high",
        selectionReason: isCollectiveHousing
          ? "같은 단지·면적의 거래이지만 해당 호수 및 공동주택가격 5% 요건 확인 필요"
          : "평가기간 내 해당 재산의 지번과 일치하는 실거래",
        authorityRank: isCollectiveHousing ? 3 : 2
      });
    }
  }
  return candidates;
}

function extractVworldFeatures(payload: unknown): Array<Record<string, unknown>> {
  const root = payload as Record<string, any>;
  return asArray(root?.response?.result?.featureCollection?.features).map(
    (feature) => (feature.properties ?? feature) as Record<string, unknown>
  );
}

function firstPrice(properties: Record<string, unknown>): number | null {
  const keys = ["pblntfpc", "pblntf_pclnd", "stdrPrice", "price", "공시가격", "기준시가"];
  for (const key of keys) {
    const value = properties[key];
    const parsed = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
}

function featureYear(properties: Record<string, unknown>): number | null {
  const keys = [
    "stdrYear",
    "baseYear",
    "pblntfYear",
    "stdYear",
    "stdrDe",
    "기준년도",
    "공시년도"
  ];
  for (const key of keys) {
    const match = String(properties[key] ?? "").match(/(?:19|20)\d{2}/);
    if (match) return Number(match[0]);
  }
  return null;
}

async function getStandardPriceCandidate(
  query: PropertyValuationQuery
): Promise<ValuationCandidate | null> {
  const key = process.env.VWORLD_API_KEY;
  const dataset = process.env[VWORLD_DATASET_ENV[query.property.type]];
  if (!key || !dataset || !query.property.pnu) return null;
  const requiresUnit =
    query.property.type === "apartment" ||
    query.property.type === "row_house" ||
    query.property.type === "officetel";
  if (requiresUnit && !query.property.unitName) return null;
  const url = new URL("https://api.vworld.kr/req/data");
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", dataset);
  url.searchParams.set("key", key);
  url.searchParams.set("format", "json");
  url.searchParams.set("size", "1000");
  url.searchParams.set("attrFilter", `pnu:=:${query.property.pnu}`);
  const features = extractVworldFeatures(await fetchPayload(url));
  const acquisitionYear = Number(query.acquisitionDate.slice(0, 4));
  const matched = features.find((feature) => {
    if (featureYear(feature) !== acquisitionYear) return false;
    if (!query.property.unitName) return true;
    const unit = String(
      feature.hoNm ?? feature.unitName ?? feature["호명"] ?? ""
    );
    return unit === query.property.unitName;
  });
  if (!matched) return null;
  const amount = firstPrice(matched);
  if (!amount) return null;
  return {
    amount,
    basis: "standard_price",
    referenceDate: `${acquisitionYear}-01-01`,
    sourceUrl: "https://www.realtyprice.kr/",
    confidence: "medium",
    selectionReason: "유효한 실거래 시가를 확인하지 못해 공식 기준시가를 적용",
    authorityRank: 4
  };
}

function distanceDays(left: string, right: string): number {
  return Math.abs(Date.parse(left) - Date.parse(right)) / 86_400_000;
}

function selectCandidate(
  candidates: ValuationCandidate[],
  acquisitionDate: string
): ValuationCandidate | null {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.basis !== "similar_transaction" ||
      (candidate.similarPropertyMatch !== undefined &&
        candidate.similarPropertyMatch.areaDiffPercent <= 5 &&
        candidate.similarPropertyMatch.standardPriceDiffPercent <= 5)
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort((left, right) => {
    const weight = left.authorityRank - right.authorityRank;
    return weight !== 0
      ? weight
      : distanceDays(left.referenceDate, acquisitionDate) -
          distanceDays(right.referenceDate, acquisitionDate);
  })[0];
}

function confirmationLinks(query: PropertyValuationQuery) {
  return [
    {
      label: "국토교통부 실거래가 공개시스템",
      url: "https://rt.molit.go.kr/",
      searchGuide: `${query.property.address} / 평가기준일 ${query.acquisitionDate}`
    },
    {
      label: "부동산공시가격 알리미",
      url: "https://www.realtyprice.kr/",
      searchGuide: `${query.property.address}${query.property.unitName ? ` / ${query.property.unitName}` : ""}`
    }
  ];
}

export async function resolveAcquisitionValuation(
  query: PropertyValuationQuery
): Promise<AcquisitionValuationResolution> {
  const window = getEvaluationWindow(query.acquisitionMethod, query.acquisitionDate);
  const warnings: string[] = [];
  let resolvedProperty = query.property;
  try {
    resolvedProperty = await resolvePropertyAddress(query.property);
  } catch (error) {
    warnings.push(`주소정보 API를 조회하지 못했습니다: ${(error as Error).message}`);
  }
  const resolvedQuery = { ...query, property: resolvedProperty };
  const known = (query.knownEvidence ?? []).map<ValuationCandidate>((evidence) => ({
    amount: evidence.amount,
    basis: evidence.basis,
    referenceDate: evidence.referenceDate,
    sourceUrl: evidence.sourceUrl ?? "https://www.nts.go.kr/",
    ...(evidence.sourceId ? { sourceId: evidence.sourceId } : {}),
    confidence: evidence.status === "determined" || evidence.status === "corrected" ? "high" : "medium",
    selectionReason: `${evidence.status} 상태로 사용자가 제시한 평가 근거`,
    authorityRank: evidence.status === "determined" || evidence.status === "corrected" ? 0 : 1,
    ...(evidence.appraisalDetails ? { appraisalDetails: evidence.appraisalDetails } : {}),
    ...(evidence.similarPropertyMatch ? { similarPropertyMatch: evidence.similarPropertyMatch } : {})
  }));

  let apiCandidates: ValuationCandidate[] = [];
  try {
    apiCandidates = await getTransactionCandidates(resolvedQuery, window);
  } catch (error) {
    warnings.push(`실거래가 API를 조회하지 못했습니다: ${(error as Error).message}`);
  }
  try {
    const standardPrice = await getStandardPriceCandidate(resolvedQuery);
    if (standardPrice) apiCandidates.push(standardPrice);
  } catch (error) {
    warnings.push(`공시가격 API를 조회하지 못했습니다: ${(error as Error).message}`);
  }

  const candidates = [...known, ...apiCandidates];
  const selected = selectCandidate(candidates, query.acquisitionDate);
  if (!selected) {
    if (
      candidates.some(
        (candidate) =>
          candidate.basis === "similar_transaction" &&
          !candidate.similarPropertyMatch
      )
    ) {
      warnings.push(
        "공동주택 유사매매사례는 확인했지만 해당 호수와의 전용면적·공동주택가격 차이가 각각 5% 이내인지 확인해야 합니다."
      );
    }
    warnings.push(
      "자동으로 확정 가능한 평가가액이 없습니다. 공식 사이트에서 확인한 값을 입력해 주세요."
    );
    return {
      status: "needs_user_confirmation",
      evaluationWindow: window,
      candidates,
      selectedValuation: null,
      selectionReason: null,
      confirmationLinks: confirmationLinks(resolvedQuery),
      caseDataPatch: null,
      warnings,
      resolvedProperty
    };
  }

  const knownEvidence = query.knownEvidence?.find(
    (evidence) =>
      evidence.amount === selected.amount &&
      evidence.referenceDate === selected.referenceDate &&
      evidence.basis === selected.basis
  );
  const valuation: AcquisitionValuation = {
    amount: selected.amount,
    basis: selected.basis,
    status: knownEvidence?.status ?? "api_estimated",
    referenceDate: selected.referenceDate,
    sourceUrl: selected.sourceUrl,
    ...(selected.sourceId ? { sourceId: selected.sourceId } : {}),
    confidence: selected.confidence,
    warnings,
    ...(selected.appraisalDetails ? { appraisalDetails: selected.appraisalDetails } : {}),
    ...(selected.similarPropertyMatch ? { similarPropertyMatch: selected.similarPropertyMatch } : {})
  };
  return {
    status: "resolved",
    evaluationWindow: window,
    candidates,
    selectedValuation: valuation,
    selectionReason: selected.selectionReason,
    confirmationLinks: confirmationLinks(resolvedQuery),
    caseDataPatch: {
      acquisition: {
        date: query.acquisitionDate,
        method: query.acquisitionMethod,
        price: valuation.amount,
        valuation
      }
    },
    warnings,
    resolvedProperty
  };
}
