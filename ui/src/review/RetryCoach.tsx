import { useEffect, useRef, useState } from "react";
import type { Square } from "chess.js";
import type { EngineFactory } from "../GameController";
import { FocusedAnalysis, type FocusRequest } from "./FocusedAnalysis";
import { planHints, type HintPlan } from "./hints";
import type { ReviewPosition, ReviewResult } from "./model";

type Props = {
  position: ReviewPosition;
  result: ReviewResult | null;
  request: FocusRequest;
  analysis: FocusedAnalysis;
  factory: EngineFactory;
  blocked: boolean;
  onHighlight: (square: Square | null) => void;
  onReveal: (move: string) => void;
  onRefined: (result: ReviewResult) => void;
};
export default function RetryCoach({
  position,
  result,
  request,
  analysis,
  factory,
  blocked,
  onHighlight,
  onReveal,
  onRefined,
}: Props) {
  const [level, setLevel] = useState(0);
  const [plan, setPlan] = useState<HintPlan | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      analysis.stop();
    },
    [analysis],
  );
  useEffect(() => {
    onHighlight(level === 2 && plan ? plan.square : null);
    return () => onHighlight(null);
  }, [level, plan, onHighlight]);
  const available =
    plan ??
    planHints(position, analysis.resultFor(request, position) ?? result);
  const matching = analysis.matches(request);
  const pending = matching && analysis.state === "running";
  const unavailable = analysis.has(request) && !available;
  async function ask(refine = false, reveal = false) {
    if (pending) return;
    if (!refine && available) {
      if (reveal) onReveal(available.move);
      else {
        setPlan(available);
        setLevel(1);
      }
      return;
    }
    if (blocked || unavailable) return;
    const token = ++generation.current;
    if (!reveal) setLevel(1);
    const results = await analysis.analyse(request, factory);
    if (token !== generation.current || !results) return;
    const next = planHints(position, results[0]);
    if (!next) return;
    onRefined(results[0]);
    setPlan(next);
    if (reveal) onReveal(next.move);
  }
  return (
    <section className="retry-coach" aria-label="Indices progressifs">
      {level > 0 && plan && (
        <div className="hint-card" role="status">
          <strong>Indice {level} / 2</strong>
          <p>{plan.idea}</p>
          {level === 2 && <p className="hint-piece">{plan.piece}</p>}
        </div>
      )}
      {(level === 0 || (!plan && !pending)) && (
        <button
          className="secondary wide"
          disabled={pending || unavailable || (blocked && !available)}
          onClick={() => void ask()}
        >
          Un indice
        </button>
      )}
      {level === 1 && plan && (
        <button
          className="secondary wide"
          disabled={pending}
          onClick={() => setLevel(2)}
        >
          Quelle pièce ?
        </button>
      )}
      {level > 0 && plan && !plan.specific && !analysis.has(request) && (
        <button
          className="text-button"
          disabled={pending || blocked}
          onClick={() => void ask(true)}
        >
          Préciser cet indice
        </button>
      )}
      {pending && (
        <div className="focused-progress" role="status" aria-live="polite">
          <span className="analysis-spinner" aria-hidden="true" /> Préparation
          de l’indice… Vous pouvez continuer à chercher.
          <button className="text-button" onClick={() => analysis.stop()}>
            Arrêter la vérification
          </button>
        </div>
      )}
      {!pending && blocked && !available && (
        <p className="hint" role="status">
          L’analyse en cours prépare les indices. Vous pouvez déjà essayer un
          coup.
        </p>
      )}
      {matching && analysis.state === "error" && (
        <div role="alert">
          <p>
            La vérification n’a pas abouti. Vous pouvez continuer à chercher ou
            réessayer.
          </p>
          <button
            className="secondary"
            disabled={blocked}
            onClick={() => void ask(true)}
          >
            Réessayer la vérification
          </button>
        </div>
      )}
      {matching && analysis.state === "unavailable" && (
        <p className="hint" role="status">
          Le moteur n’a pas fourni d’indice fiable dans le budget prévu. Vous
          pouvez essayer un autre budget ou moteur dans les options.
        </p>
      )}
      {matching && analysis.state === "complete" && plan && !plan.specific && (
        <p className="hint" role="status">
          La vérification n’a pas trouvé d’indice plus précis pour cette
          position.
        </p>
      )}
      {matching && analysis.state === "stopped" && (
        <p className="hint" role="status">
          Vérification interrompue.
        </p>
      )}
      <button
        className="secondary wide"
        disabled={pending || unavailable || (blocked && !available)}
        onClick={() => void ask(false, true)}
      >
        Voir la solution
      </button>
    </section>
  );
}
