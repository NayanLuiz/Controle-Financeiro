import { type FormEvent, useState } from 'react';
import {
  type CategoryDto,
  type EntryType,
  createCategorySchema,
} from '../../shared/contracts/index.js';
import { ApiRequestError, apiClient } from '../api/client.js';
import { CategoryBadge } from '../components/CategoryBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { useToast } from '../components/Toast.js';

const COLOR_SWATCHES = [
  '#EA580C',
  '#D97706',
  '#059669',
  '#0D9488',
  '#0284C7',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#9333EA',
  '#C026D3',
  '#DB2777',
  '#E11D48',
  '#DC2626',
  '#16A34A',
  '#0891B2',
  '#475569',
] as const;

export interface CategoriesViewProps {
  readonly categories: readonly CategoryDto[];
  readonly onCategoriesChanged: () => void;
}

export function CategoriesView({ categories, onCategoriesChanged }: CategoriesViewProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<EntryType>('EXPENSE');
  const [showArchived, setShowArchived] = useState<boolean>(true);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<EntryType>('EXPENSE');
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictCategory, setConflictCategory] = useState<CategoryDto | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const visibleCategories = categories.filter(
    (c) => c.type === activeTab && (showArchived || !c.isArchived),
  );

  const resetForm = () => {
    setEditingCategory(null);
    setName('');
    setType(activeTab);
    setColor(COLOR_SWATCHES[0]);
    setErrorMessage(null);
  };

  const handleStartEdit = (cat: CategoryDto) => {
    setEditingCategory(cat);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = createCategorySchema.safeParse({ name, type, color });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await apiClient.updateCategory(editingCategory.id, {
          name: parsed.data.name,
          type: editingCategory.hasLinkedRecords ? undefined : parsed.data.type,
          color: parsed.data.color,
        });
        toast.success(`Categoria "${parsed.data.name}" atualizada com sucesso!`);
      } else {
        await apiClient.createCategory(parsed.data);
        toast.success(`Categoria "${parsed.data.name}" criada com sucesso!`);
      }
      resetForm();
      onCategoriesChanged();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      } else {
        setErrorMessage('Erro ao salvar a categoria.');
        toast.error('Erro ao salvar a categoria.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async (cat: CategoryDto) => {
    setErrorMessage(null);
    try {
      await apiClient.updateCategory(cat.id, { isArchived: !cat.isArchived });
      setConflictCategory(null);
      toast.success(
        cat.isArchived
          ? `Categoria "${cat.name}" reativada com sucesso!`
          : `Categoria "${cat.name}" arquivada.`,
      );
      onCategoriesChanged();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      }
    }
  };

  const handleDelete = async (cat: CategoryDto) => {
    setErrorMessage(null);
    try {
      await apiClient.deleteCategory(cat.id);
      setDeletingCategory(null);
      toast.success(`Categoria "${cat.name}" excluída.`);
      onCategoriesChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setConflictCategory(cat);
      } else if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      }
    }
  };

  const expenseCount = categories.filter(
    (c) => c.type === 'EXPENSE' && (showArchived || !c.isArchived),
  ).length;
  const incomeCount = categories.filter(
    (c) => c.type === 'INCOME' && (showArchived || !c.isArchived),
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section className="card" aria-labelledby="cat-form-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <h2 id="cat-form-heading" style={{ margin: 0, fontSize: '1.125rem' }}>
            {editingCategory ? `Editar Categoria: ${editingCategory.name}` : 'Nova Categoria'}
          </h2>
          <div className="cat-preview-container">
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                marginRight: '0.5rem',
              }}
            >
              Pré-visualização:
            </span>
            <CategoryBadge name={name.trim() || 'Exemplo'} color={color} />
          </div>
        </div>

        {errorMessage && (
          <div className="alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="field-group">
              <label htmlFor="cat-name-input" className="field-label">
                Nome da categoria
              </label>
              <input
                id="cat-name-input"
                type="text"
                className="input-control"
                placeholder="Ex.: Educação"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="cat-type-select" className="field-label">
                Tipo
              </label>
              <select
                id="cat-type-select"
                className="select-control"
                value={type}
                disabled={Boolean(editingCategory?.hasLinkedRecords)}
                onChange={(e) => setType(e.target.value as EntryType)}
              >
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </select>
              {editingCategory?.hasLinkedRecords && (
                <span className="field-hint">
                  O tipo não pode ser alterado porque esta categoria já possui transações ou
                  orçamentos vinculados.
                </span>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="cat-color-input" className="field-label">
                Cor identificadora (#RRGGBB)
              </label>
              <input
                id="cat-color-input"
                type="text"
                className="input-control tabular-nums"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          <div className="chip-list" aria-label="Sugestões de cores">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="chip-btn"
                aria-pressed={color.toUpperCase() === swatch}
                onClick={() => setColor(swatch)}
                aria-label={`Selecionar cor ${swatch}`}
              >
                <span className="category-dot" style={{ backgroundColor: swatch }} />
                <span className="tabular-nums">{swatch}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {editingCategory ? 'Salvar alterações' : 'Criar categoria'}
            </button>
            {editingCategory && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      {conflictCategory && (
        <section className="card" role="alertdialog" aria-labelledby="conflict-dialog-title">
          <h3 id="conflict-dialog-title" style={{ marginTop: 0 }}>
            Não é possível excluir "{conflictCategory.name}" permanentemente
          </h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Esta categoria possui transações ou orçamentos vinculados e não pode ser excluída
            permanentemente. Arquive-a para ocultá-la de novos lançamentos sem perder seu histórico.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleToggleArchive(conflictCategory)}
            >
              Arquivar categoria
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConflictCategory(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="card" aria-label="Categorias cadastradas">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div className="segmented-control" style={{ width: '320px' }}>
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={activeTab === 'EXPENSE'}
              onClick={() => {
                setActiveTab('EXPENSE');
                if (!editingCategory) setType('EXPENSE');
              }}
            >
              Despesas{' '}
              <span className="tabular-nums" style={{ opacity: 0.8, fontSize: '0.8rem' }}>
                ({expenseCount})
              </span>
            </button>
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={activeTab === 'INCOME'}
              onClick={() => {
                setActiveTab('INCOME');
                if (!editingCategory) setType('INCOME');
              }}
            >
              Receitas{' '}
              <span className="tabular-nums" style={{ opacity: 0.8, fontSize: '0.8rem' }}>
                ({incomeCount})
              </span>
            </button>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span className="field-label">Mostrar arquivadas</span>
          </label>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
          {visibleCategories.map((cat) => (
            <li
              key={cat.id}
              style={{
                padding: '0.75rem',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <CategoryBadge name={cat.name} color={cat.color} isArchived={cat.isArchived} />

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                  onClick={() => handleStartEdit(cat)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                  onClick={() => void handleToggleArchive(cat)}
                >
                  {cat.isArchived ? 'Reativar' : 'Arquivar'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ minHeight: '36px', padding: '0.25rem 0.6rem' }}
                  onClick={() => {
                    if (cat.hasLinkedRecords) {
                      setConflictCategory(cat);
                    } else {
                      setDeletingCategory(cat);
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {deletingCategory && (
        <ConfirmModal
          isOpen={true}
          title="Excluir Categoria"
          message={`Tem certeza que deseja excluir permanentemente a categoria "${deletingCategory.name}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          isDestructive={true}
          onConfirm={() => void handleDelete(deletingCategory)}
          onCancel={() => setDeletingCategory(null)}
        />
      )}
    </div>
  );
}
