import { categories, type Annotation } from "./annotations";

export default function AnnotationBadge({
  annotation,
  provisional = false,
  compact = false,
}: {
  annotation: Annotation | null | undefined;
  provisional?: boolean;
  compact?: boolean;
}) {
  if (!annotation) return null;
  const category = categories[annotation.category];
  const uncertain =
    provisional && !["book", "forced"].includes(annotation.category);
  const label = `${category.label}${uncertain ? " · provisoire" : ""}`;
  return (
    <span
      className={`annotation annotation-${annotation.category}`}
      title={`${label} — ${annotation.reason}`}
      aria-label={label}
    >
      <span className="annotation-symbol" aria-hidden="true">
        {annotation.category === "excellent" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              fill="currentColor"
              d="M3 10h4v11H3zM9 10l4-7c.4-.7 1.6-.5 1.8.3.5 1.9-.1 3.8-.8 5.7h5.4c1.2 0 2 1 1.7 2.2l-1.8 8.2c-.2.9-1 1.6-2 1.6H9z"
            />
          </svg>
        ) : annotation.category === "book" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1v15" />
          </svg>
        ) : annotation.category === "forced" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        ) : (
          category.symbol
        )}
      </span>
      {!compact && <span>{label}</span>}
    </span>
  );
}
