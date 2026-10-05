export default function MoveNavigation({
  selected,
  total,
  onSelect,
  label = "Parcourir les coups joués",
}: {
  selected: number;
  total: number;
  onSelect: (index: number) => void;
  label?: string;
}) {
  return (
    <div className="review-navigation" aria-label={label}>
      <button
        className="secondary"
        disabled={selected === 0}
        onClick={() => onSelect(0)}
        aria-label="Position initiale"
      >
        ⏮
      </button>
      <button
        className="secondary"
        disabled={selected === 0}
        onClick={() => onSelect(selected - 1)}
        aria-label="Position précédente"
        title="Coup précédent (← ou <)"
      >
        ←
      </button>
      <span>
        {selected} / {total}
      </span>
      <button
        className="secondary"
        disabled={selected === total}
        onClick={() => onSelect(selected + 1)}
        aria-label="Position suivante"
        title="Coup suivant (→ ou >)"
      >
        →
      </button>
      <button
        className="secondary"
        disabled={selected === total}
        onClick={() => onSelect(total)}
        aria-label="Position finale"
      >
        ⏭
      </button>
    </div>
  );
}
