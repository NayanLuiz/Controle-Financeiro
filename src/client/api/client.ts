import type {
  BudgetProgressDto,
  BudgetsResponseDto,
  CategoryDto,
  CreateCategoryInput,
  DashboardResponseDto,
  EntryType,
  ListTransactionsQuery,
  LoginRequest,
  PaginatedTransactionsDto,
  PeriodQuery,
  RegisterRequest,
  TransactionDto,
  UpdateCategoryInput,
  UpsertBudgetInput,
  UpsertTransactionInput,
  UserDto,
} from '../../shared/contracts/index.js';

interface ErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: Record<string, unknown>;
    readonly retryAfterSeconds?: number;
  };
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly retryAfterSeconds?: number;

  public constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

let unauthorizedListener: (() => void) | null = null;

export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  notifyUnauthorized = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let parsed: ErrorEnvelope | null = null;
    try {
      parsed = (await response.json()) as ErrorEnvelope;
    } catch {
      parsed = null;
    }

    const retryHeader = response.headers.get('Retry-After');
    const retryFromHeader = retryHeader ? Number.parseInt(retryHeader, 10) : undefined;
    const retryAfterSeconds =
      parsed?.error?.retryAfterSeconds ??
      (retryFromHeader !== undefined && Number.isFinite(retryFromHeader)
        ? retryFromHeader
        : undefined);

    if (response.status === 401 && notifyUnauthorized && unauthorizedListener) {
      unauthorizedListener();
    }

    throw new ApiRequestError({
      status: response.status,
      code: parsed?.error?.code ?? `HTTP_${response.status}`,
      message: parsed?.error?.message ?? 'Não foi possível concluir a operação.',
      details: parsed?.error?.details,
      retryAfterSeconds,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  getSession(): Promise<{ authenticated: boolean; user?: UserDto }> {
    return requestJson<{ authenticated: boolean; user?: UserDto }>(
      '/api/auth/session',
      { method: 'GET' },
      false,
    );
  },

  login(input: LoginRequest): Promise<{ authenticated: boolean; user?: UserDto }> {
    return requestJson<{ authenticated: boolean; user?: UserDto }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      false,
    );
  },

  register(input: RegisterRequest): Promise<{ authenticated: boolean; user?: UserDto }> {
    return requestJson<{ authenticated: boolean; user?: UserDto }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      false,
    );
  },

  logout(): Promise<void> {
    return requestJson<void>('/api/auth/logout', { method: 'POST' }, false);
  },

  listCategories(params?: {
    type?: EntryType;
    includeArchived?: boolean;
  }): Promise<{ items: CategoryDto[] }> {
    const query = new URLSearchParams();
    if (params?.type) {
      query.set('type', params.type);
    }
    if (params?.includeArchived !== undefined) {
      query.set('includeArchived', String(params.includeArchived));
    }
    const qs = query.toString();
    return requestJson<{ items: CategoryDto[] }>(`/api/categories${qs ? `?${qs}` : ''}`);
  },

  createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
    return requestJson<CategoryDto>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
    return requestJson<CategoryDto>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteCategory(id: string): Promise<void> {
    return requestJson<void>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  listTransactions(
    params: Partial<ListTransactionsQuery> & { month: number; year: number },
  ): Promise<PaginatedTransactionsDto> {
    const query = new URLSearchParams({
      month: String(params.month),
      year: String(params.year),
    });
    if (params.type) {
      query.set('type', params.type);
    }
    if (params.categoryId) {
      query.set('categoryId', params.categoryId);
    }
    if (params.search && params.search.trim().length > 0) {
      query.set('search', params.search.trim());
    }
    if (params.page !== undefined) {
      query.set('page', String(params.page));
    }
    if (params.pageSize !== undefined) {
      query.set('pageSize', String(params.pageSize));
    }
    return requestJson<PaginatedTransactionsDto>(`/api/transactions?${query.toString()}`);
  },

  createTransaction(input: UpsertTransactionInput): Promise<TransactionDto> {
    return requestJson<TransactionDto>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateTransaction(id: string, input: UpsertTransactionInput): Promise<TransactionDto> {
    return requestJson<TransactionDto>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteTransaction(id: string): Promise<void> {
    return requestJson<void>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  listBudgets(period: PeriodQuery): Promise<BudgetsResponseDto> {
    const query = new URLSearchParams({
      month: String(period.month),
      year: String(period.year),
    });
    return requestJson<BudgetsResponseDto>(`/api/budgets?${query.toString()}`);
  },

  upsertBudget(input: UpsertBudgetInput): Promise<BudgetProgressDto> {
    return requestJson<BudgetProgressDto>('/api/budgets', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteBudget(id: string): Promise<void> {
    return requestJson<void>(`/api/budgets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getDashboard(period: PeriodQuery): Promise<DashboardResponseDto> {
    const query = new URLSearchParams({
      month: String(period.month),
      year: String(period.year),
    });
    return requestJson<DashboardResponseDto>(`/api/dashboard?${query.toString()}`);
  },
};
