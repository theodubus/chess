import type { ExplanationLine } from "./explanations";
import type { PositionalNotes } from "./positional";

export default function PositionalPanel({
  notes,
  compact,
  onShow,
}: {
  notes: PositionalNotes;
  compact: boolean;
  onShow: (line: ExplanationLine) => void;
}) {
  const observation = notes.played ?? notes.alternative;
  if (!observation) return null;
  const content = (
    <>
      <p className="position-fact-title">
        {observation.fact.title}
        {!notes.played && " · coup proposé"}
      </p>
      <p>{observation.fact.text}</p>
      <button className="secondary" onClick={() => onShow(observation.line)}>
        Voir le repère
      </button>
      {notes.played && notes.alternative && (
        <details className="position-comparison">
          <summary>Comparer avec le coup proposé</summary>
          <p>{notes.alternative.fact.text}</p>
          <button
            className="secondary"
            onClick={() => onShow(notes.alternative!.line)}
          >
            Voir le repère proposé
          </button>
        </details>
      )}
      <p className="hint position-limit">
        Observation sur le plateau. Le lien avec le verdict du moteur reste à
        confirmer.
      </p>
    </>
  );
  return compact ? (
    <details className="position-notes" aria-label="Repères positionnels">
      <summary>Repères positionnels</summary>
      {content}
    </details>
  ) : (
    <section className="position-notes" aria-label="Repères positionnels">
      <p className="position-kind">Observation positionnelle</p>
      {content}
    </section>
  );
}
