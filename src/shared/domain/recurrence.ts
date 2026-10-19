import { getDaysInMonth, parseCivilDate, stepMonthYear } from './civil-date.js';

export const DEFAULT_RECURRENCE_YEARS = 1;
export const MAX_RECURRENCE_MONTHS = 36;

/**
 * Generates subsequent monthly civil dates starting from the next month after `startDate`
 * up to `endDate` (inclusive), keeping the same day of the month where possible,
 * or clamping to the last valid day of shorter months (e.g. Feb 28/29, Apr 30).
 *
 * @param startDate The initial transaction civil date (YYYY-MM-DD)
 * @param endDate The target end civil date (YYYY-MM-DD)
 * @param maxOccurrences Safety limit on maximum generated instances (default 36)
 * @returns Array of civil date strings for subsequent monthly occurrences.
 */
export function generateMonthlyRecurringDates(
  startDate: string,
  endDate: string,
  maxOccurrences: number = MAX_RECURRENCE_MONTHS,
): readonly string[] {
  const startParts = parseCivilDate(startDate);
  const endParts = parseCivilDate(endDate);

  if (!startParts || !endParts) {
    return [];
  }

  if (endDate <= startDate) {
    return [];
  }

  const occurrences: string[] = [];
  let monthStep = 1;

  while (occurrences.length < maxOccurrences) {
    const targetPeriod = stepMonthYear(startParts.month, startParts.year, monthStep);
    const maxDayInTargetMonth = getDaysInMonth(targetPeriod.year, targetPeriod.month);
    const targetDay = Math.min(startParts.day, maxDayInTargetMonth);

    const targetDate = `${targetPeriod.year}-${String(targetPeriod.month).padStart(2, '0')}-${String(
      targetDay,
    ).padStart(2, '0')}`;

    if (targetDate > endDate) {
      break;
    }

    occurrences.push(targetDate);
    monthStep += 1;
  }

  return occurrences;
}
