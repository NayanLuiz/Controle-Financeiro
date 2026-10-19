const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const MIN_AMOUNT_CENTS = 1;
export const MAX_AMOUNT_CENTS = 99_999_999_999;

export function isValidAmountCents(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents >= MIN_AMOUNT_CENTS && cents <= MAX_AMOUNT_CENTS;
}

export function formatCentsToBrl(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Monetary value in cents must be a safe integer.');
  }
  const normalizedCents = Object.is(cents, -0) ? 0 : cents;
  const formattedAbs = brlFormatter.format(Math.abs(normalizedCents) / 100).replace(/\u00A0/g, ' ');
  return normalizedCents < 0 ? `- ${formattedAbs}` : formattedAbs;
}

export function parseDigitsToCents(rawInput: string): number {
  const digits = rawInput.replace(/\D/g, '');
  if (digits.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, MAX_AMOUNT_CENTS);
}

export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}
