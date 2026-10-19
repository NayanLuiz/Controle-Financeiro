import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, EntryType, TransactionDto, UserDto } from '../shared/contracts/index.js';
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || 'FP').toUpperCase();
}

export function App() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>(
    'checking',
  );
  const [currentUser, setCurrentUser] = useState<UserDto>({
    id: 'default-user',
    name: 'Conta Principal',
    username: 'admin',
  });
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
      .then((res) => {
        if (active) {
          if (res.user) {
            setCurrentUser(res.user);
          }
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
    setCategories([]);
    setAuthStatus('unauthenticated');
  };

  if (authStatus === 'checking') {
    return (
      <main className="auth-shell" aria-busy="true">
        <div className="card" style={{ padding: '2rem 2.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Carregando sua conta financeira...</p>
        </div>
      </main>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <LoginView
        onAuthenticated={(user) => {
          if (user) {
            setCurrentUser(user);
          }
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

  const viewSubtitle: Record<AppView, string> = {
    dashboard: `Olá, ${currentUser.name} — acompanhe seu fluxo de caixa e metas`,
    transactions: 'Histórico detalhado de receitas e despesas do período',
    budgets: 'Planejamento de limites mensais de gastos por categoria',
    categories: 'Organização de categorias de receitas e despesas da sua conta',
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Menu principal">
        <div className="brand-header">
          <div className="brand-mark" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '1.15rem',
                letterSpacing: '-0.02em',
              }}
            >
              FinPulse
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Finanças Pessoais
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'flex-start', padding: '0.65rem 0.9rem' }}
          onClick={handleOpenNewTransaction}
        >
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
          <span>Nova Transação</span>
          <kbd className="kbd-shortcut" title="Atalho de teclado: tecla N">
            N
          </kbd>
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
                <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span>Visão Geral</span>
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
                <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span>Transações</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="app-nav-btn"
                aria-current={activeView === 'budgets' ? 'page' : undefined}
                onClick={() => setActiveView('budgets')}
              >
                <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                <span>Orçamentos</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="app-nav-btn"
                aria-current={activeView === 'categories' ? 'page' : undefined}
                onClick={() => setActiveView('categories')}
              >
                <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                  <path d="M7 7h.01" />
                </svg>
                <span>Categorias</span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="user-profile-card">
          <div className="user-profile-row">
            <div className="user-avatar" aria-hidden="true">
              {getInitials(currentUser.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentUser.name}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                @{currentUser.username}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '36px', padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setIsDarkTheme((prev) => !prev)}
            >
              {isDarkTheme ? '☀️ Claro' : '🌙 Escuro'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '36px', padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => void handleLogout()}
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
              {viewTitle[activeView]}
            </h1>
            <p
              style={{
                margin: '0.1rem 0 0 0',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              {viewSubtitle[activeView]}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {activeView !== 'categories' && (
              <MonthYearPicker month={period.month} year={period.year} onChange={setPeriod} />
            )}

            <button type="button" className="btn btn-primary" onClick={handleOpenNewTransaction}>
              + Nova Transação
            </button>
          </div>
        </header>

        <main className="app-content">
          {activeView === 'dashboard' && (
            <DashboardView
              key={`dash-${refreshTrigger}-${currentUser.id}`}
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
              key={`tx-${refreshTrigger}-${currentUser.id}`}
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
              key={`budgets-${refreshTrigger}-${currentUser.id}`}
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

      <nav className="mobile-bottom-bar" aria-label="Navegação inferior">
        <button
          type="button"
          className="mobile-nav-btn"
          aria-current={activeView === 'dashboard' ? 'page' : undefined}
          onClick={() => setActiveView('dashboard')}
        >
          <span>📊</span>
          <span>Início</span>
        </button>
        <button
          type="button"
          className="mobile-nav-btn"
          aria-current={activeView === 'transactions' ? 'page' : undefined}
          onClick={() => setActiveView('transactions')}
        >
          <span>💳</span>
          <span>Transações</span>
        </button>
        <button
          type="button"
          className="mobile-fab-btn"
          aria-label="Nova Transação"
          onClick={handleOpenNewTransaction}
        >
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>+</span>
          <span>Lançar</span>
        </button>
        <button
          type="button"
          className="mobile-nav-btn"
          aria-current={activeView === 'budgets' ? 'page' : undefined}
          onClick={() => setActiveView('budgets')}
        >
          <span>🎯</span>
          <span>Metas</span>
        </button>
        <button
          type="button"
          className="mobile-nav-btn"
          aria-current={activeView === 'categories' ? 'page' : undefined}
          onClick={() => setActiveView('categories')}
        >
          <span>🏷️</span>
          <span>Categorias</span>
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
