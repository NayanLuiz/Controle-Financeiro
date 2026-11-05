import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CategoryDto,
  EntryType,
  PaginatedTransactionsDto,
  TransactionDto,
  TransactionStatus,
} from '../../shared/contracts/index.js';
import { formatCivilDatePtBr, getTodayCivilDate } from '../../shared/domain/civil-date.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';
import { ApiRequestError, apiClient } from '../api/client.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { formatMonthYearLabel } from '../components/MonthYearPicker.js';
import { useToast } from '../components/Toast.js';

export interface TransactionsViewProps {
  readonly month: number;
  readonly year: number;
  readonly categories: readonly CategoryDto[];
  readonly initialCategoryId?: string;
  readonly initialType?: EntryType | '';
  readonly onOpenNewTransaction: () => void;
  readonly onEditTransaction: (tx: TransactionDto) => void;
  readonly onDataChanged: () => void;
}

export function TransactionsView({
  month,
  year,
  categories,
  initialCategoryId = '',
  initialType = '',
  onOpenNewTransaction,
  onEditTransaction,
  onDataChanged,
}: TransactionsViewProps) {
  const toast = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestRequestRef = useRef(0);
  const [filterType, setFilterType] = useState<EntryType | ''>(initialType);
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | ''>('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>(initialCategoryId);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [result, setResult] = useState<PaginatedTransactionsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingRecurringTx, setDeletingRecurringTx] = useState<TransactionDto | null>(null);
  const [deletingSingleTx, setDeletingSingleTx] = useState<TransactionDto | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    setFilterCategoryId(initialCategoryId);
    setFilterType(initialType);
    setPage(1);
  }, [initialCategoryId, initialType]);

  const loadTransactions = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setResult(null);
    try {
      const data = await apiClient.listTransactions({
        month,
        year,
        type: filterType || undefined,
        status: filterStatus || undefined,
        categoryId: filterCategoryId || undefined,
        search: searchTerm.trim() || undefined,
        page,
        pageSize,
      });
      if (requestId === latestRequestRef.current) setResult(data);
    } catch {
      if (requestId === latestRequestRef.current) {
        setErrorMessage('Não foi possível carregar as transações do período.');
      }
    } finally {
      if (requestId === latestRequestRef.current) setIsLoading(false);
    }
  }, [month, year, filterType, filterStatus, filterCategoryId, searchTerm, page, pageSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    void loadTransactions();
    return () => {
      latestRequestRef.current += 1;
    };
  }, [loadTransactions]);

  const handleToggleStatus = async (tx: TransactionDto) => {
    const nextStatus: TransactionStatus = tx.status === 'PAID' ? 'PENDING' : 'PAID';
    setOpenMenuId(null);
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === tx.id ? { ...item, status: nextStatus } : item,
        ),
      };
    });
    try {
      await apiClient.updateTransactionStatus(tx.id, nextStatus);
      toast.success(
        `Transação marcada como ${
          nextStatus === 'PAID' ? (tx.type === 'INCOME' ? 'recebida' : 'paga') : 'pendente'
        }.`,
      );
      onDataChanged();
      void loadTransactions();
    } catch {
      setErrorMessage('Não foi possível alterar o status de pagamento.');
      toast.error('Não foi possível alterar o status de pagamento.');
      void loadTransactions();
    }
  };

  const handleDelete = async (tx: TransactionDto, scope: 'single' | 'following' = 'single') => {
    setOpenMenuId(null);
    try {
      await apiClient.deleteTransaction(tx.id, scope);
      setDeletingRecurringTx(null);
      setDeletingSingleTx(null);
      toast.success('Transação excluída com sucesso.');
      onDataChanged();
      void loadTransactions();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      } else {
        setErrorMessage('Erro ao excluir a transação.');
        toast.error('Erro ao excluir a transação.');
      }
    }
  };

  const handleExportCsv = () => {
    const url = apiClient.exportTransactionsCsvUrl({
      month,
      year,
      type: filterType || undefined,
      status: filterStatus || undefined,
      categoryId: filterCategoryId || undefined,
      search: searchTerm.trim() || undefined,
    });
    window.open(url, '_blank');
    toast.success('Extrato CSV gerado para download!');
  };

  const hasActiveFilters =
    filterType !== '' ||
    filterStatus !== '' ||
    filterCategoryId !== '' ||
    searchTerm.trim().length > 0;

  const items = result?.items ?? [];
  const meta = result?.meta ?? {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize,
  };
  const periodLabel = formatMonthYearLabel(month, year);

  const filterExpenseCents = result?.filteredSummary.expenseCents ?? 0;

  // Stitch: Agrupamento Cronológico por Data
  const groupedTransactions = useMemo(() => {
    const today = getTodayCivilDate();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getTodayCivilDate(yesterdayDate);

    const groups: { label: string; date: string; items: TransactionDto[] }[] = [];
    const dateMap = new Map<string, TransactionDto[]>();

    for (const tx of items) {
      const list = dateMap.get(tx.date) ?? [];
      list.push(tx);
      dateMap.set(tx.date, list);
    }

    for (const [date, txs] of dateMap.entries()) {
      let label = formatCivilDatePtBr(date);
      if (date === today) {
        label = `Hoje, ${formatCivilDatePtBr(date)}`;
      } else if (date === yesterday) {
        label = `Ontem, ${formatCivilDatePtBr(date)}`;
      }
      groups.push({ label, date, items: txs });
    }

    return groups;
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Bloco de Busca & Ação CSV do Stitch */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '12px',
              color: 'var(--color-outline)',
              fontSize: '20px',
              pointerEvents: 'none',
            }}
          >
            search
          </span>
          <input
            ref={searchInputRef}
            id="search-input"
            type="search"
            className="input-control"
            style={{ width: '100%', paddingLeft: '2.5rem', height: '46px', borderRadius: '14px' }}
            placeholder="Buscar transação por nome... (/)"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ height: '46px', padding: '0 1rem', borderRadius: '14px', flexShrink: 0 }}
          onClick={handleExportCsv}
          title="Exportar extrato em formato CSV"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '18px', color: 'var(--color-primary)' }}
          >
            download
          </span>
          <span>CSV</span>
        </button>
      </div>

      {/* Barra de Filtros Rápidos (Chips Roláveis do Stitch) */}
      <div className="stitch-filter-chips">
        {/* Filtro Tipo */}
        <button
          type="button"
          className={`stitch-chip ${filterType === '' && filterStatus === '' ? 'active' : ''}`}
          onClick={() => {
            setFilterType('');
            setFilterStatus('');
            setFilterCategoryId('');
            setPage(1);
          }}
        >
          <span>Todas</span>
        </button>
        <button
          type="button"
          className={`stitch-chip ${filterType === 'INCOME' ? 'active' : ''}`}
          onClick={() => {
            setFilterType('INCOME');
            setPage(1);
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--color-secondary)' }}
          >
            trending_up
          </span>
          <span>Receitas (+)</span>
        </button>
        <button
          type="button"
          className={`stitch-chip ${filterType === 'EXPENSE' ? 'active' : ''}`}
          onClick={() => {
            setFilterType('EXPENSE');
            setPage(1);
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--color-tertiary-container)' }}
          >
            trending_down
          </span>
          <span>Despesas (-)</span>
        </button>

        <div style={{ width: '1px', height: '18px', background: 'var(--color-outline-variant)' }} />

        {/* Filtro Status */}
        <button
          type="button"
          className={`stitch-chip ${filterStatus === 'PAID' ? 'active' : ''}`}
          onClick={() => {
            setFilterStatus('PAID');
            setPage(1);
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--color-secondary)' }}
          >
            check_circle
          </span>
          <span>Concluídos</span>
        </button>
        <button
          type="button"
          className={`stitch-chip ${filterStatus === 'PENDING' ? 'active' : ''}`}
          onClick={() => {
            setFilterStatus('PENDING');
            setPage(1);
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--color-tertiary-container)' }}
          >
            schedule
          </span>
          <span>Pendentes</span>
        </button>

        {/* Categoria Select */}
        <div style={{ position: 'relative' }}>
          <select
            className="stitch-chip"
            style={{ appearance: 'none', paddingRight: '1.75rem', cursor: 'pointer' }}
            value={filterCategoryId}
            onChange={(e) => {
              setFilterCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as Categorias</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '14px',
              pointerEvents: 'none',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            expand_more
          </span>
        </div>
      </div>

      {/* Resumo Operacional do Filtro (Stitch) */}
      <section className="stitch-card" style={{ padding: '1rem' }} aria-label="Resumo do Extrato">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
          }}
        >
          <span>Fluxo Líquido Filtrado</span>
          <span>{periodLabel}</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}
        >
          <div className="stitch-subcard-low">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '16px', color: 'var(--color-secondary)' }}
              >
                check_circle
              </span>
              <span>Total Pago</span>
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--color-on-surface)',
                marginTop: '0.2rem',
              }}
            >
              - {formatCentsToBrl(filterExpenseCents)}
            </div>
          </div>

          <div className="stitch-subcard-low">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '16px', color: 'var(--color-tertiary-container)' }}
              >
                pending
              </span>
              <span>Pendente</span>
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--color-tertiary-container)',
                marginTop: '0.2rem',
              }}
            >
              {formatCentsToBrl(result?.pendingSummary?.pendingExpenseCents ?? 0)}
            </div>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="alert-banner" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Lista de Transações Agrupada por Data (Stitch) */}
      {isLoading && !result ? (
        <div className="stitch-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p aria-busy="true">Carregando transações...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="stitch-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)' }}>
            Nenhuma transação encontrada
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {hasActiveFilters
              ? 'Tente ajustar os filtros ou a busca acima.'
              : `Comece registrando sua primeira movimentação em ${periodLabel}.`}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.5rem' }}
            onClick={onOpenNewTransaction}
          >
            + Nova Transação
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {groupedTransactions.map((group) => (
            <div key={group.date} className="stitch-tx-group">
              <div className="stitch-tx-group-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--color-primary-container)',
                    }}
                  />
                  <span>{group.label}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  {group.items.length} {group.items.length === 1 ? 'transação' : 'transações'}
                </span>
              </div>

              <div className="stitch-tx-card-list">
                {group.items.map((tx) => (
                  <div key={tx.id} className="stitch-tx-item">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      {/* Ícone de Categoria */}
                      <div
                        className="stitch-cat-icon"
                        style={{
                          background: tx.categoryColor
                            ? `${tx.categoryColor}20`
                            : 'var(--color-surface-high)',
                          color: tx.categoryColor || 'var(--color-primary)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                          {tx.type === 'INCOME' ? 'payments' : 'shopping_bag'}
                        </span>
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: 'var(--color-on-surface)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {tx.description}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            marginTop: '0.15rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <CategoryBadge
                            name={tx.categoryName}
                            color={tx.categoryColor}
                            isArchived={tx.categoryIsArchived}
                          />
                          <span style={{ color: 'var(--color-outline-variant)' }}>•</span>
                          {/* Badge Duplo Status */}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background:
                                tx.status === 'PAID'
                                  ? 'rgba(0, 108, 74, 0.12)'
                                  : 'rgba(213, 32, 34, 0.12)',
                              color:
                                tx.status === 'PAID'
                                  ? 'var(--color-secondary)'
                                  : 'var(--color-tertiary-container)',
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: '11px',
                                fontVariationSettings:
                                  tx.status === 'PAID' ? "'FILL' 1" : undefined,
                              }}
                            >
                              {tx.status === 'PAID' ? 'check_circle' : 'schedule'}
                            </span>
                            <span>
                              {tx.status === 'PAID'
                                ? tx.type === 'INCOME'
                                  ? 'Recebido'
                                  : 'Pago'
                                : 'Pendente'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Valor e Menu Contextual */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="tabular-nums"
                        style={{
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color:
                            tx.type === 'INCOME'
                              ? 'var(--color-secondary)'
                              : 'var(--color-tertiary-container)',
                        }}
                      >
                        {tx.type === 'INCOME' ? '+ ' : '- '}
                        {formatCentsToBrl(tx.amountCents)}
                      </span>

                      {/* Botão de Menu Contextual (...) */}
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: 0,
                            background: 'transparent',
                            color: 'var(--color-outline)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          onClick={() => setOpenMenuId((prev) => (prev === tx.id ? null : tx.id))}
                          aria-label={`Ações para ${tx.description}`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                            more_vert
                          </span>
                        </button>

                        {/* Menu Dropdown Flutuante */}
                        {openMenuId === tx.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '36px',
                              zIndex: 30,
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border-card)',
                              borderRadius: '12px',
                              boxShadow: 'var(--shadow-lg)',
                              padding: '0.35rem',
                              display: 'flex',
                              flexDirection: 'column',
                              minWidth: '160px',
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.65rem',
                                border: 0,
                                background: 'transparent',
                                borderRadius: '8px',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'var(--color-on-surface)',
                                textAlign: 'left',
                              }}
                              onClick={() => void handleToggleStatus(tx)}
                            >
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: '16px', color: 'var(--color-secondary)' }}
                              >
                                {tx.status === 'PAID' ? 'schedule' : 'check_circle'}
                              </span>
                              <span>
                                {tx.status === 'PAID' ? 'Marcar Pendente' : 'Marcar como Pago'}
                              </span>
                            </button>

                            <button
                              type="button"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.65rem',
                                border: 0,
                                background: 'transparent',
                                borderRadius: '8px',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'var(--color-on-surface)',
                                textAlign: 'left',
                              }}
                              onClick={() => {
                                setOpenMenuId(null);
                                onEditTransaction(tx);
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: '16px', color: 'var(--color-outline)' }}
                              >
                                edit
                              </span>
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.65rem',
                                border: 0,
                                background: 'transparent',
                                borderRadius: '8px',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'var(--color-tertiary-container)',
                                textAlign: 'left',
                              }}
                              onClick={() => {
                                setOpenMenuId(null);
                                if (tx.isRecurring) {
                                  setDeletingRecurringTx(tx);
                                } else {
                                  setDeletingSingleTx(tx);
                                }
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: '16px' }}
                              >
                                delete
                              </span>
                              <span>Excluir</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Paginação do Extrato */}
          <div
            className="tabular-nums"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.5rem 0',
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>
              Mostrando <strong>{items.length}</strong> de <strong>{meta.totalItems}</strong>{' '}
              transações
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                disabled={meta.currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                disabled={meta.currentPage >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais de Exclusão */}
      {deletingRecurringTx && (
        <div className="modal-backdrop">
          <dialog
            open
            className="modal-panel"
            aria-modal="true"
            aria-labelledby="recurring-del-title"
          >
            <h2 id="recurring-del-title" style={{ fontSize: '1.25rem', marginTop: 0 }}>
              Excluir conta recorrente
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              A transação <strong>&quot;{deletingRecurringTx.description}&quot;</strong> faz parte
              de uma conta recorrente. Como deseja prosseguir?
            </p>
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleDelete(deletingRecurringTx, 'single')}
              >
                Excluir apenas esta transação
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDelete(deletingRecurringTx, 'following')}
              >
                Excluir esta e todas as ocorrências futuras
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingRecurringTx(null)}
              >
                Cancelar
              </button>
            </div>
          </dialog>
        </div>
      )}

      {deletingSingleTx && (
        <ConfirmModal
          isOpen={true}
          title="Excluir Transação"
          message={`Tem certeza que deseja excluir "${deletingSingleTx.description}" (${formatCentsToBrl(deletingSingleTx.amountCents)})? Esta operação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          isDestructive={true}
          onConfirm={() => void handleDelete(deletingSingleTx, 'single')}
          onCancel={() => setDeletingSingleTx(null)}
        />
      )}
    </div>
  );
}
