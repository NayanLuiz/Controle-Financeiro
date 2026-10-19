import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryDto,
  EntryType,
  PaginatedTransactionsDto,
  TransactionDto,
} from '../../shared/contracts/index.js';
import { formatCivilDatePtBr } from '../../shared/domain/civil-date.js';
import { formatCentsToBrl } from '../../shared/domain/money.js';
import { ApiRequestError, apiClient } from '../api/client.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { formatMonthYearLabel } from '../components/MonthYearPicker.js';

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
  const [filterType, setFilterType] = useState<EntryType | ''>(initialType);
  const [filterCategoryId, setFilterCategoryId] = useState<string>(initialCategoryId);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [result, setResult] = useState<PaginatedTransactionsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setFilterCategoryId(initialCategoryId);
    setFilterType(initialType);
    setPage(1);
  }, [initialCategoryId, initialType]);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiClient.listTransactions({
        month,
        year,
        type: filterType || undefined,
        categoryId: filterCategoryId || undefined,
        search: searchTerm.trim() || undefined,
        page,
        pageSize,
      });
      setResult(data);
    } catch {
      setErrorMessage('Não foi possível carregar as transações do período.');
    } finally {
      setIsLoading(false);
    }
  }, [month, year, filterType, filterCategoryId, searchTerm, page, pageSize]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const handleDelete = async (tx: TransactionDto) => {
    try {
      await apiClient.deleteTransaction(tx.id);
      onDataChanged();
      void loadTransactions();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Erro ao excluir a transação.');
      }
    }
  };

  const hasActiveFilters =
    filterType !== '' || filterCategoryId !== '' || searchTerm.trim().length > 0;
  const items = result?.items ?? [];
  const meta = result?.meta ?? {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize,
  };
  const periodLabel = formatMonthYearLabel(month, year);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section className="card" aria-label="Filtros de transações">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <div className="field-group">
            <label htmlFor="filter-type-select" className="field-label">
              Tipo
            </label>
            <select
              id="filter-type-select"
              className="select-control"
              value={filterType}
              onChange={(event) => {
                setFilterType(event.target.value as EntryType | '');
                setPage(1);
              }}
            >
              <option value="">Todos os tipos</option>
              <option value="EXPENSE">Despesas</option>
              <option value="INCOME">Receitas</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="filter-category-select" className="field-label">
              Categoria
            </label>
            <select
              id="filter-category-select"
              className="select-control"
              value={filterCategoryId}
              onChange={(event) => {
                setFilterCategoryId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as categorias</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                  {cat.isArchived ? ' (Arquivada)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="filter-search-input" className="field-label">
              Buscar descrição
            </label>
            <input
              id="filter-search-input"
              type="search"
              className="input-control"
              placeholder="Ex.: Almoço, Salário..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFilterType('');
                setFilterCategoryId('');
                setSearchTerm('');
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {errorMessage && (
        <div className="alert-banner" role="alert">
          {errorMessage}
        </div>
      )}

      <section className="card" aria-label="Lista de transações do período">
        {isLoading && !result ? (
          <p aria-busy="true">Carregando transações...</p>
        ) : items.length === 0 ? (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            {hasActiveFilters ? (
              <>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Nenhuma transação encontrada para os filtros selecionados.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setFilterType('');
                    setFilterCategoryId('');
                    setSearchTerm('');
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  Nenhuma transação em {periodLabel}
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Registre suas receitas e despesas para acompanhar seu saldo em tempo real.
                </p>
                <button type="button" className="btn btn-primary" onClick={onOpenNewTransaction}>
                  + Nova Transação
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <table className="tx-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id}>
                    <td data-label="Data" className="tabular-nums">
                      {formatCivilDatePtBr(tx.date)}
                    </td>
                    <td data-label="Descrição">{tx.description}</td>
                    <td data-label="Categoria">
                      <CategoryBadge
                        name={tx.categoryName}
                        color={tx.categoryColor}
                        isArchived={tx.categoryIsArchived}
                      />
                    </td>
                    <td
                      data-label="Valor"
                      className={`tabular-nums ${
                        tx.type === 'INCOME' ? 'text-income' : 'text-expense'
                      }`}
                      style={{ fontWeight: 600 }}
                    >
                      {tx.type === 'INCOME' ? '+ ' : '- '}
                      {formatCentsToBrl(tx.amountCents)}
                    </td>
                    <td data-label="Ações">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                          onClick={() => onEditTransaction(tx)}
                          aria-label={`Editar transação ${tx.description}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                          onClick={() => void handleDelete(tx)}
                          aria-label={`Excluir transação ${tx.description}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              className="tabular-nums"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--color-border-subtle)',
                fontSize: '0.875rem',
              }}
            >
              <span>
                Total: <strong>{meta.totalItems}</strong> transações (Página{' '}
                <strong>{meta.currentPage}</strong> de <strong>{meta.totalPages}</strong>)
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="page-size-select" className="field-label">
                  Itens:
                </label>
                <select
                  id="page-size-select"
                  className="select-control"
                  style={{ width: 'auto', minHeight: '36px' }}
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number.parseInt(event.target.value, 10));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '36px' }}
                  disabled={meta.currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '36px' }}
                  disabled={meta.currentPage >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
