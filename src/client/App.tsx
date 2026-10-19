import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, EntryType, TransactionDto } from '../shared/contracts/index.js';
import { MAX_YEAR, MIN_YEAR } from '../shared/domain/civil-date.js';
import { apiClient, setUnauthorizedListener } from './api/client.js';
import { MonthYearPicker } from './components/MonthYearPicker.js';
import { TransactionModal } from './components/TransactionModal.js';
import { BudgetsView } from './features/BudgetsView.js';
import { CategoriesView } from './features/CategoriesView.js';
import { DashboardView } from './features/DashboardView.js';
import { LoginView } from './features/LoginView.js';
import { TransactionsView } from './features/TransactionsView.js';

export type AppView = 'dashboard' | 'transactions' | 'budgets' | 'categories';

function readInitialPeriodFromUrl(): { month: number; year: number } {
  const now = new Date();
  const fallbackMonth = now.getMonth() + 1;
  const fallbackYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, now.getFullYear()));

  if (typeof window === 'undefined') {
    return { month: fallbackMonth, year: fallbackYear };
  }

  const params = new URLSearchParams(window.location.search);
  const m = Number.parseInt(params.get('month') ?? '', 10);
  const y = Number.parseInt(params.get('year') ?? '', 10);

  return {
    month: m >= 1 && m <= 12 ? m : fallbackMonth,
    year: y >= MIN_YEAR && y <= MAX_YEAR ? y : fallbackYear,
  };
}

export function App() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>(
    'checking',
  );
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [period, setPeriod] = useState<{ month: number; year: number }>(() =>
    readInitialPeriodFromUrl(),
  );
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<TransactionDto | null>(null);
  const [txFilterCategory, setTxFilterCategory] = useState<string>('');
  const [txFilterType, setTxFilterType] = useState<EntryType | ''>('');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);

  const bumpRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const response = await apiClient.listCategories({ includeArchived: true });
      setCategories(response.items);
    } catch {
      // Handled by unauthorized listener or view level error
    }
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => {
      setAuthStatus('unauthenticated');
    });
    return () => setUnauthorizedListener(null);
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .getSession()
      .then(() => {
        if (active) {
          setAuthStatus('authenticated');
          void loadCategories();
        }
      })
      .catch(() => {
        if (active) {
          setAuthStatus('unauthenticated');
        }
      });
    return () => {
      active = false;
    };
  }, [loadCategories]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkTheme);
    }
  }, [isDarkTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('month', String(period.month));
    url.searchParams.set('year', String(period.year));
    window.history.replaceState({}, '', url.toString());
  }, [period]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return;
      }
      if ((event.key === 'n' || event.key === 'N') && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setEditingTx(null);
        setIsTxModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authStatus]);

  const handleOpenNewTransaction = () => {
    setEditingTx(null);
    setIsTxModalOpen(true);
  };

  const handleLogout = async () => {
    await apiClient.logout();
    setAuthStatus('unauthenticated');
  };

  if (authStatus === 'checking') {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }} aria-busy="true">
        <p>Verificando sessão...</p>
      </main>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <LoginView
        onLoginSuccess={() => {
          setAuthStatus('authenticated');
          void loadCategories();
          bumpRefresh();
        }}
      />
    );
  }

  const viewTitle: Record<AppView, string> = {
    dashboard: 'Visão Geral',
    transactions: 'Transações',
    budgets: 'Orçamentos do Mês',
    categories: 'Categorias',
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Menu principal">
        <div>
          <div className="app-brand">Controle Financeiro</div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleOpenNewTransaction}
          >
            + Nova Transação
          </button>

          <nav aria-label="Navegação lateral">
            <ul className="app-nav-list">
              <li>
                <button
                  type="button"
                  className="app-nav-btn"
                  aria-current={activeView === 'dashboard' ? 'page' : undefined}
                  onClick={() => setActiveView('dashboard')}
                >
                  Visão Geral
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="app-nav-btn"
                  aria-current={activeView === 'transactions' ? 'page' : undefined}
                  onClick={() => {
                    setTxFilterCategory('');
                    setTxFilterType('');
                    setActiveView('transactions');
                  }}
                >
                  Transações
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="app-nav-btn"
                  aria-current={activeView === 'budgets' ? 'page' : undefined}
                  onClick={() => setActiveView('budgets')}
                >
                  Orçamentos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="app-nav-btn"
                  aria-current={activeView === 'categories' ? 'page' : undefined}
                  onClick={() => setActiveView('categories')}
                >
                  Categorias
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsDarkTheme((prev) => !prev)}
          >
            {isDarkTheme ? 'Modo Claro' : 'Modo Escuro'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void handleLogout()}>
            Sair
          </button>
        </div>
      </aside>

      <div className="app-main-area">
        <header className="app-topbar">
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{viewTitle[activeView]}</h1>

          {activeView !== 'categories' && (
            <MonthYearPicker month={period.month} year={period.year} onChange={setPeriod} />
          )}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={handleOpenNewTransaction}>
              + Nova Transação
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void handleLogout()}>
              Sair
            </button>
          </div>
        </header>

        <main className="app-content">
          {activeView === 'dashboard' && (
            <DashboardView
              key={`dash-${refreshTrigger}`}
              month={period.month}
              year={period.year}
              onOpenNewTransaction={handleOpenNewTransaction}
              onNavigateToBudgets={() => setActiveView('budgets')}
              onFilterByCategory={(categoryId, type) => {
                setTxFilterCategory(categoryId);
                setTxFilterType(type);
                setActiveView('transactions');
              }}
            />
          )}

          {activeView === 'transactions' && (
            <TransactionsView
              key={`tx-${refreshTrigger}`}
              month={period.month}
              year={period.year}
              categories={categories}
              initialCategoryId={txFilterCategory}
              initialType={txFilterType}
              onOpenNewTransaction={handleOpenNewTransaction}
              onEditTransaction={(tx) => {
                setEditingTx(tx);
                setIsTxModalOpen(true);
              }}
              onDataChanged={bumpRefresh}
            />
          )}

          {activeView === 'budgets' && (
            <BudgetsView
              key={`budgets-${refreshTrigger}`}
              month={period.month}
              year={period.year}
              onDataChanged={bumpRefresh}
            />
          )}

          {activeView === 'categories' && (
            <CategoriesView
              categories={categories}
              onCategoriesChanged={() => {
                void loadCategories();
                bumpRefresh();
              }}
            />
          )}
        </main>
      </div>

      <nav className="app-bottom-nav" aria-label="Navegação inferior">
        <button
          type="button"
          className="bottom-nav-item"
          aria-current={activeView === 'dashboard' ? 'page' : undefined}
          onClick={() => setActiveView('dashboard')}
        >
          Início
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          aria-current={activeView === 'transactions' ? 'page' : undefined}
          onClick={() => setActiveView('transactions')}
        >
          Transações
        </button>
        <button
          type="button"
          className="bottom-nav-fab"
          aria-label="Nova Transação"
          onClick={handleOpenNewTransaction}
        >
          +
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          aria-current={activeView === 'budgets' ? 'page' : undefined}
          onClick={() => setActiveView('budgets')}
        >
          Orçamentos
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          aria-current={activeView === 'categories' ? 'page' : undefined}
          onClick={() => setActiveView('categories')}
        >
          Categorias
        </button>
      </nav>

      <TransactionModal
        isOpen={isTxModalOpen}
        categories={categories}
        editingTransaction={editingTx}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSaved={() => {
          bumpRefresh();
        }}
      />
    </div>
  );
}
