import { parseIsoDate } from "./date.js";

export function giftCarryoverYears(giftDate: string): number {
  return giftDate >= "2023-01-01" ? 10 : 5;
}

function subtractYears(value: string, years: number): string {
  const date = parseIsoDate(value);
  const lastDay = new Date(Date.UTC(date.year - years, date.month, 0)).getUTCDate();
  return new Date(
    Date.UTC(date.year - years, date.month - 1, Math.min(date.day, lastDay))
  )
    .toISOString()
    .slice(0, 10);
}

export function isWithinGiftCarryoverPeriod(
  giftDate: string,
  transferDate: string
): boolean {
  parseIsoDate(giftDate);
  const threshold = subtractYears(transferDate, giftCarryoverYears(giftDate));
  return giftDate >= threshold && giftDate < transferDate;
}
