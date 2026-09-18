import type { GameReview } from "./GameReview";

export default function ReviewProgress({ review }: { review: GameReview }) {
  const busy = review.state === "idle" || review.state === "running";
  const verifying =
    review.phase === "verification" && review.state === "running";
  const resolving = review.phase === "resolution" && review.state === "running";
  const done = resolving
    ? review.resolvedPositions
    : verifying
      ? review.verified.size
      : review.completed;
  const total = resolving
    ? review.resolutionTotal
    : verifying
      ? review.verificationTotal
      : review.positions.length;
  const title =
    review.state === "idle"
      ? "Préparation de l’analyse…"
      : review.state === "complete"
        ? "Analyse terminée"
        : review.state === "stopped"
          ? "Analyse interrompue"
          : review.state === "error"
            ? "Moteur indisponible"
            : resolving
              ? "Approfondissement des coups non classés…"
              : verifying
                ? "Vérification des annotations en cours…"
                : "Analyse en cours…";
  return (
    <div
      className={`review-progress ${busy ? "is-calculating" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="review-progress-heading">
        {busy && <span className="analysis-spinner" aria-hidden="true" />}
        <strong>{title}</strong>
        <span>
          {busy
            ? resolving
              ? "Calcul ciblé"
              : `Étape ${verifying ? 2 : 1}/2`
            : `${review.completed}/${review.positions.length}`}
        </span>
      </div>
      {busy && (
        <p>
          {resolving
            ? "Le moteur dispose de plus de temps sur les positions avant et après les coups encore non classés."
            : verifying
              ? "Le moteur approfondit les coups critiques avant de finaliser les annotations."
              : "Le moteur calcule les évaluations position par position. Les résultats apparaissent progressivement."}{" "}
          Vous pouvez déjà parcourir les coups.
        </p>
      )}
      {busy && (
        <div className="review-progress-track">
          <progress
            max={total || 1}
            value={done}
            aria-label={
              resolving
                ? "Positions approfondies"
                : verifying
                  ? "Positions vérifiées"
                  : "Positions analysées"
            }
          />
          <span>
            {done}/{total} positions
          </span>
        </div>
      )}
      {(review.state === "stopped" || review.state === "error") && (
        <p>
          Les résultats sont partiels. Vous pouvez relancer l’analyse depuis les
          options.
        </p>
      )}
      {review.state === "complete" && review.unclassifiedCount > 0 && (
        <p>
          {review.unclassifiedCount} coup(s) restent non classés malgré
          l’approfondissement ciblé. Les évaluations disponibles ne permettent
          pas de trancher.
        </p>
      )}
    </div>
  );
}
