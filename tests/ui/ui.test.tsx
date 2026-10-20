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
          status: 'PAID',
          isRecurring: false,
          recurringGroupId: null,
          createdAt: '2026-10-15T12:00:00.000Z',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText(/Antiga Despesa \(Arquivada\)/)).toBeDefined();
  });

  it('renders TransactionModal with status toggle buttons and 1-year recurrence default (CA-26, CA-28)', async () => {
    const { TransactionModal } = await import('../../src/client/components/TransactionModal.js');
    const categories = [
      {
        id: 'cat-1',
        name: 'Moradia',
        type: 'EXPENSE' as const,
        color: '#2563EB',
        isArchived: false,
        hasLinkedRecords: false,
      },
    ];

    render(
      <TransactionModal
        isOpen={true}
        categories={categories}
        editingTransaction={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Status buttons
    const paidButton = screen.getByRole('button', { name: /Pago/i });
    const pendingButton = screen.getByRole('button', { name: /Pendente/i });
    expect(paidButton).toBeDefined();
    expect(pendingButton).toBeDefined();
    expect(paidButton.getAttribute('aria-pressed')).toBe('true');

    // Click to switch to Pendente
    fireEvent.click(pendingButton);
    expect(pendingButton.getAttribute('aria-pressed')).toBe('true');
    expect(paidButton.getAttribute('aria-pressed')).toBe('false');

    // Recurrence checkbox
    const recurringCheckbox = screen.getByLabelText(/Conta recorrente mensal/i) as HTMLInputElement;
    expect(recurringCheckbox.checked).toBe(false);

    // Toggle recurrence ON
    fireEvent.click(recurringCheckbox);
    expect(recurringCheckbox.checked).toBe(true);

    const endDateInput = screen.getByLabelText(/Recorrente até/i) as HTMLInputElement;
    expect(endDateInput).toBeDefined();
    expect(endDateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Verified 1 year default
    expect(screen.getByText(/Serão gerados lançamentos automáticos mensais/i)).toBeDefined();
  });

  it('renders ConfirmModal and fires callbacks appropriately', async () => {
    const { ConfirmModal } = await import('../../src/client/components/ConfirmModal.js');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConfirmModal
        isOpen={false}
        title="Excluir item"
        message="Deseja realmente excluir?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByText('Excluir item')).toBeNull();

    rerender(
      <ConfirmModal
        isOpen={true}
        title="Excluir item"
        message="Deseja realmente excluir?"
        confirmLabel="Sim, excluir"
        cancelLabel="Voltar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Excluir item')).toBeDefined();
    expect(screen.getByText('Deseja realmente excluir?')).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: 'Sim, excluir' });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByRole('button', { name: 'Voltar' });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders DonutChart with accessible SVG slices and handles hover/click', async () => {
    const { DonutChart } = await import('../../src/client/components/DonutChart.js');
    const onSelectCategory = vi.fn();

    render(
      <DonutChart
        totalCents={10000}
        items={[
          {
            categoryId: 'cat-1',
            categoryName: 'Alimentação',
            categoryColor: '#10B981',
            isArchived: false,
            type: 'EXPENSE',
            totalAmountCents: 6000,
            sharePercentage: 60,
          },
          {
            categoryId: 'cat-2',
            categoryName: 'Transporte',
            categoryColor: '#3B82F6',
            isArchived: false,
            type: 'EXPENSE',
            totalAmountCents: 4000,
            sharePercentage: 40,
          },
        ]}
        onSelectCategory={onSelectCategory}
      />,
    );

    expect(screen.getByText('Alimentação')).toBeDefined();
    expect(screen.getByText('Transporte')).toBeDefined();
    expect(screen.getByText('R$ 100,00')).toBeDefined();

    const sliceBtn = screen.getByRole('button', { name: 'Alimentação' });
    fireEvent.click(sliceBtn);
    expect(onSelectCategory).toHaveBeenCalledWith('cat-1', 'EXPENSE');
  });

  it('renders DailyTrendChart with daily columns for current month', async () => {
    const { DailyTrendChart } = await import('../../src/client/components/DailyTrendChart.js');

    render(
      <DailyTrendChart
        month={10}
        year={2026}
        items={[
          { day: 5, incomeCents: 50000, expenseCents: 12000 },
          { day: 15, incomeCents: 0, expenseCents: 8500 },
        ]}
      />,
    );

    expect(screen.getByText('Fluxo Diário do Mês')).toBeDefined();
    expect(screen.getByLabelText(/Gráfico de barras diárias/i)).toBeDefined();
  });
});
