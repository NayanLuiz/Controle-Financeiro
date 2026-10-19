import type { ChangeEvent } from 'react';
import { MAX_YEAR, MIN_YEAR, stepMonthYear } from '../../shared/domain/civil-date.js';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

export interface MonthYearPickerProps {
  readonly month: number;
  readonly year: number;
  readonly onChange: (next: { month: number; year: number }) => void;
}

export function formatMonthYearLabel(month: number, year: number): string {
  const monthName = MONTH_NAMES[month - 1] ?? 'Mês';
  return `${monthName} de ${year}`;
}

export function MonthYearPicker({ month, year, onChange }: MonthYearPickerProps) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, now.getFullYear()));
  const isCurrentPeriod = month === currentMonth && year === currentYear;

  const isAtMinBoundary = year <= MIN_YEAR && month <= 1;
  const isAtMaxBoundary = year >= MAX_YEAR && month >= 12;

  const handleStep = (delta: number) => {
    const next = stepMonthYear(month, year, delta);
    onChange(next);
  };

  const handleMonthSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextMonth = Number.parseInt(event.target.value, 10);
    if (nextMonth >= 1 && nextMonth <= 12) {
      onChange({ month: nextMonth, year });
    }
  };

  const handleYearSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextYear = Number.parseInt(event.target.value, 10);
    if (nextYear >= MIN_YEAR && nextYear <= MAX_YEAR) {
      onChange({ month, year: nextYear });
    }
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
      aria-label="Seletor de competência mensal"
    >
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => handleStep(-1)}
        disabled={isAtMinBoundary}
        aria-label="Mês anterior"
      >
        ◀
      </button>

      <select
        aria-label="Selecionar mês"
        className="select-control"
        style={{ width: 'auto' }}
        value={month}
        onChange={handleMonthSelect}
      >
        {MONTH_NAMES.map((label, index) => {
          const monthNum = index + 1;
          return (
            <option key={monthNum} value={monthNum}>
              {label}
            </option>
          );
        })}
      </select>

      <select
        aria-label="Selecionar ano"
        className="select-control tabular-nums"
        style={{ width: 'auto' }}
        value={year}
        onChange={handleYearSelect}
      >
        {YEAR_OPTIONS.map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => handleStep(1)}
        disabled={isAtMaxBoundary}
        aria-label="Próximo mês"
      >
        ▶
      </button>

      {!isCurrentPeriod && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange({ month: currentMonth, year: currentYear })}
        >
          Mês atual
        </button>
      )}
    </div>
  );
}
