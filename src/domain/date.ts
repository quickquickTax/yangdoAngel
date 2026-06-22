const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDate(value: string): DateParts {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`날짜 형식은 YYYY-MM-DD여야 합니다: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`존재하지 않는 날짜입니다: ${value}`);
  }

  return { year, month, day };
}

export function compareDates(left: DateParts, right: DateParts): number {
  const l = Date.UTC(left.year, left.month - 1, left.day);
  const r = Date.UTC(right.year, right.month - 1, right.day);
  return Math.sign(l - r);
}

export function calculateFullHoldingYears(
  acquisitionDate: string,
  transferDate: string
): number {
  const acquisition = parseIsoDate(acquisitionDate);
  const transfer = parseIsoDate(transferDate);

  if (compareDates(transfer, acquisition) <= 0) {
    throw new Error("양도일은 취득일 이후여야 합니다.");
  }

  let years = transfer.year - acquisition.year;
  if (
    transfer.month < acquisition.month ||
    (transfer.month === acquisition.month && transfer.day < acquisition.day)
  ) {
    years -= 1;
  }
  return Math.max(0, years);
}
