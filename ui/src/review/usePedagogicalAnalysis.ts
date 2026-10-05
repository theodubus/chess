import { useEffect, useMemo, useState } from "react";
import type { EngineFactory } from "../GameController";
import {
  eligibleConsequence, PedagogicalAnalysis, pedagogicalSignature,
  type PedagogicalRequest,
} from "./understanding/PedagogicalAnalysis";

export type ConsequenceState = "idle" | "pending" | "extracting" | "verifying" | "supported" | "unconfirmed" | "unavailable";

export function usePedagogicalAnalysis(input: PedagogicalRequest | null, factory: EngineFactory, enabled: boolean) {
  const [analysis] = useState(() => new PedagogicalAnalysis());
  const [, render] = useState(0);
  useEffect(() => analysis.subscribe(() => render((value) => value + 1)), [analysis]);
  const signature = input ? pedagogicalSignature(input) : "", review = input?.review;
  const request = useMemo(() => {
    if (!signature || !review) return null;
    const [revision, engineId, position, result, category] = JSON.parse(signature);
    return { review, revision, engineId, position, result, category } as PedagogicalRequest;
  }, [signature, review]);
  const eligible = !!request && eligibleConsequence(request);
  useEffect(() => {
    if (!enabled || !eligible || !request) return;
    const timer = setTimeout(() => void analysis.analyse(request, factory), 300);
    return () => { clearTimeout(timer); analysis.stop(); };
  }, [enabled, eligible, request, factory, analysis]);
  const matches = !!request && analysis.matches(request);
  const result = enabled && request ? analysis.resultFor(request) : null;
  const state: ConsequenceState = !enabled || !request ? "idle"
    : !eligible ? "unconfirmed"
    : result ? result.status
    : !matches ? "pending"
    : analysis.state === "extracting" || analysis.state === "verifying" ? analysis.state
    : ["error", "timed-out"].includes(analysis.state) ? "unavailable" : "pending";
  return { analysis, result, state };
}
