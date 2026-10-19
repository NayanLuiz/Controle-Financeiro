const CIVIL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export interface CivilDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function parseCivilDate(dateStr: string): CivilDateParts | null {
  const match = CIVIL_DATE_REGEX.exec(dateStr);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return { year, month, day };
}

export function isValidCivilDate(dateStr: string): boolean {
  return parseCivilDate(dateStr) !== null;
}

export function formatCivilDatePtBr(dateStr: string): string {
  const parts = parseCivilDate(dateStr);
  if (!parts) {
    return dateStr;
  }
  const d = String(parts.day).padStart(2, '0');
  const m = String(parts.month).padStart(2, '0');
  return `${d}/${m}/${parts.year}`;
}

export function getTodayCivilDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function stepMonthYear(
  month: number,
  year: number,
  deltaMonths: number,
): { month: number; year: number } {
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  const clampedYear = Math.max(MIN_YEAR, Math.min(MAX_YEAR, nextYear));
  return { month: nextMonth, year: clampedYear };
}
