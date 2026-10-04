import { useEffect, useMemo, useState } from "react";
import type { EngineFactory } from "../GameController";
import { FocusedAnalysis } from "./FocusedAnalysis";
import type { CauseCandidate } from "./decisionCause";
import type { ReviewPosition } from "./model";

/** Seul le coup consulté déclenche ces recherches. Une navigation rapide les
 * annule avant de lancer un moteur ; les publications tardives restent isolées. */
export function useCauseCheck(
  candidate: CauseCandidate | undefined,
  review: object,
  revision: number,
  engineId: string,
  factory: EngineFactory,
  enabled: boolean,
) {
  const [check] = useState(() => new FocusedAnalysis(1200, 6000));
  const [, render] = useState(0);
  useEffect(() => check.subscribe(() => render((value) => value + 1)), [check]);
  const signature = candidate ? JSON.stringify(candidate.positions) : "";
  const request = useMemo(
    () =>
      signature
        ? {
            review,
            revision,
            engineId,
            positions: JSON.parse(signature) as ReviewPosition[],
          }
        : null,
    [review, revision, engineId, signature],
  );
  useEffect(() => {
    if (!enabled || !request) return;
    const timer = setTimeout(() => void check.analyse(request, factory), 300);
    return () => {
      clearTimeout(timer);
      check.stop();
    };
  }, [enabled, request, factory, check]);
  const matches = !!request && check.matches(request);
  const cached = !!request && check.has(request);
  return {
    pending:
      !!request &&
      enabled &&
      !cached &&
      (!matches || !["error", "unavailable"].includes(check.state)),
    failed:
      matches && (check.state === "error" || check.state === "unavailable"),
    checked: cached,
    results:
      request && cached && !check.isUnavailable(request)
        ? request.positions.map((position) =>
            check.resultFor(request, position),
          )
        : [],
  };
}
