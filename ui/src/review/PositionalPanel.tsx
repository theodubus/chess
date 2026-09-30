import type { ExplanationLine } from "./explanations";
import type { PositionalNotes, PositionalObservation } from "./positional";

export default function PositionalPanel({
  notes,
  activeTitle,
  onShow,
}: {
  notes: PositionalNotes;
  activeTitle?: string;
  onShow: (line: ExplanationLine) => void;
}) {
  const observation = notes.played ?? notes.alternative;
  if (!observation) return null;
  const show = (item: PositionalObservation, proposed = false) =>
    item.line && (
      <button
        className="secondary"
        aria-pressed={activeTitle === item.line.title}
        onClick={() => onShow(item.line!)}
      >
        {activeTitle === item.line.title
          ? "Masquer les repères"
          : proposed
            ? "Voir les cases du coup proposé"
            : "Voir les cases concernées"}
      </button>
    );
  return (
    <details
      className="position-notes"
      aria-label="Observations complémentaires"
    >
      <summary>Observations complémentaires</summary>
      <p className="hint position-limit">
        Ces constats décrivent le plateau ; ils n’expliquent pas à eux seuls le
        verdict.
      </p>
      <p className="position-fact-title">
        {observation.fact.title}
        {!notes.played && " · coup proposé"}
      </p>
      <p>{observation.fact.text}</p>
      {show(observation, !notes.played)}
      {notes.played && notes.alternative && (
        <details className="position-comparison">
          <summary>Comparer avec le coup proposé</summary>
          <p>{notes.alternative.fact.text}</p>
          {show(notes.alternative, true)}
        </details>
      )}
    </details>
  );
}
