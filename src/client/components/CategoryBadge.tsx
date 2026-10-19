export interface CategoryBadgeProps {
  readonly name: string;
  readonly color: string;
  readonly isArchived?: boolean;
}

export function CategoryBadge({ name, color, isArchived = false }: CategoryBadgeProps) {
  return (
    <span className="category-badge">
      <span className="category-dot" style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{name}</span>
      {isArchived && <span style={{ opacity: 0.75 }}>(Arquivada)</span>}
    </span>
  );
}
