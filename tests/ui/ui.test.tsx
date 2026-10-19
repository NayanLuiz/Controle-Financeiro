// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryBadge } from '../../src/client/components/CategoryBadge.js';
import {
  MonthYearPicker,
  formatMonthYearLabel,
} from '../../src/client/components/MonthYearPicker.js';
import {
  StatusBadge,
  formatBudgetStatusText,
  formatPercentagePtBr,
} from '../../src/client/components/StatusBadge.js';

describe('UI Components & Multimodal Accessibility (T-7 to T-9, RNF-5, CA-23..CA-25)', () => {
  it('renders StatusBadge with explicit accessible label and formats status text for NORMAL, WARNING, EXCEEDED', () => {
    const { rerender } = render(<StatusBadge status="NORMAL" />);
    expect(screen.getByText('Dentro da meta')).toBeDefined();

    rerender(<StatusBadge status="WARNING" />);
    expect(screen.getByText('Atenção')).toBeDefined();

    rerender(<StatusBadge status="EXCEEDED" />);
    expect(screen.getByText('Estourado')).toBeDefined();

    expect(formatPercentagePtBr(79.99)).toBe('79,99%');
    expect(
      formatBudgetStatusText({
        status: 'NORMAL',
        remainingCents: 20010,
        usagePercentage: 79.99,
      }),
    ).toContain('Restam R$ 200,10 (79,99% utilizado)');

    expect(
      formatBudgetStatusText({
        status: 'WARNING',
        remainingCents: 10000,
        usagePercentage: 80,
      }),
    ).toContain('próximo ao limite');

    expect(
      formatBudgetStatusText({
        status: 'EXCEEDED',
        remainingCents: -15000,
        usagePercentage: 150,
      }),
    ).toContain('Excedido em R$ 150,00 (150,00% utilizado)');
  });

  it('renders CategoryBadge with archived indicator when isArchived is true (CA-11)', () => {
    render(<CategoryBadge name="Lazer Antigo" color="#D97706" isArchived={true} />);
    expect(screen.getByText('Lazer Antigo')).toBeDefined();
    expect(screen.getByText('(Arquivada)')).toBeDefined();
  });

  it('renders MonthYearPicker and triggers onChange when stepping months', () => {
    const onChange = vi.fn();
    render(<MonthYearPicker month={10} year={2026} onChange={onChange} />);

    expect(formatMonthYearLabel(10, 2026)).toBe('Outubro de 2026');
    fireEvent.click(screen.getByLabelText('Mês anterior'));
    expect(onChange).toHaveBeenCalledWith({ month: 9, year: 2026 });

    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(onChange).toHaveBeenCalledWith({ month: 11, year: 2026 });
  });

  it('renders TransactionModal with cents mask and keeps archived category only when editing (CA-11, CA-13, CA-14)', async () => {
    const { TransactionModal } = await import('../../src/client/components/TransactionModal.js');
    const categories = [
      {
        id: 'cat-active',
        name: 'Alimentação',
        type: 'EXPENSE' as const,
        color: '#EA580C',
        isArchived: false,
        hasLinkedRecords: false,
      },
      {
        id: 'cat-archived',
        name: 'Antiga Despesa',
        type: 'EXPENSE' as const,
        color: '#475569',
        isArchived: true,
        hasLinkedRecords: true,
      },
    ];

    const { rerender } = render(
      <TransactionModal
        isOpen={true}
        categories={categories}
        editingTransaction={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText('Alimentação')).toBeDefined();
    expect(screen.queryByText(/Antiga Despesa/)).toBeNull();

    const amountInput = screen.getByLabelText(/Valor/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '4590' } });
    expect(amountInput.value).toContain('45,90');

    rerender(
      <TransactionModal
        isOpen={true}
        categories={categories}
        editingTransaction={{
          id: 'tx-1',
          type: 'EXPENSE',
          amountCents: 4590,
          date: '2026-10-15',
          description: 'Jantar',
          categoryId: 'cat-archived',
          categoryName: 'Antiga Despesa',
          categoryColor: '#475569',
          categoryIsArchived: true,
          createdAt: '2026-10-15T12:00:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/Antiga Despesa \(Arquivada\)/)).toBeDefined();
  });
});
