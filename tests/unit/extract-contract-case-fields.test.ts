import { describe, expect, it } from "vitest";
import { extractContractCaseFields } from "../../src/tools/extract-contract-case-fields.js";

describe("extractContractCaseFields", () => {
  it("extracts transfer contract candidates into validate-compatible case data", () => {
    const result = extractContractCaseFields(
      [
        "부동산 매매계약서",
        "계약일: 2026년 6월 1일",
        "매매대금: 600,000,000원",
        "목적물: 서울시 테스트구 테스트동 아파트"
      ].join("\n"),
      "transfer"
    );

    expect(result.partialCaseData).toMatchObject({
      transfer: { date: "2026-06-01", price: 600_000_000 },
      asset: { subType: "housing" },
      acquisition: { method: "purchase" }
    });
    expect(result.unresolvedFields).toContain("acquisition.date");
    expect(result.questions).toContain("취득일 또는 취득 잔금일은 언제입니까?");
  });

  it("does not assign generic contract labels when the document type is unknown", () => {
    const result = extractContractCaseFields(
      "계약일: 2026.6.1\n매매대금: 600,000,000원",
      "unknown"
    );

    expect(result.partialCaseData).not.toHaveProperty("transfer");
    expect(result.partialCaseData).toMatchObject({
      acquisition: { method: "purchase" }
    });
    expect(result.partialCaseData).not.toHaveProperty("acquisition.date");
    expect(result.partialCaseData).not.toHaveProperty("acquisition.price");
    expect(result.warnings).toContain(
      "계약일은 확인했지만 양도계약서인지 취득계약서인지 알 수 없어 날짜 필드에 자동 배정하지 않았습니다."
    );
    expect(result.warnings).toContain(
      "매매대금은 확인했지만 양도계약서인지 취득계약서인지 알 수 없어 금액 필드에 자동 배정하지 않았습니다."
    );
  });

  it("extracts acquisition labels without overwriting transfer fields", () => {
    const result = extractContractCaseFields(
      "취득일: 2018-01-02\n취득가액: 300000000원\n취득 원인: 매매",
      "acquisition"
    );

    expect(result.partialCaseData).toMatchObject({
      acquisition: {
        date: "2018-01-02",
        price: 300_000_000,
        method: "purchase"
      }
    });
    expect(result.partialCaseData).not.toHaveProperty("transfer");
  });
});
