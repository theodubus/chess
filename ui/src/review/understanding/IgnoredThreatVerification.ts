import { CaptureLossVerification, captureLossConclusion, inspectCaptureLoss, type CaptureLossPass, type CaptureLossReport, type CaptureLossRequest } from "./CaptureLossVerification";
import type { IgnoredThreat } from "./ignoredThreat";
import type { ReviewPosition, ReviewResult } from "../model";

export type IgnoredThreatRequest = CaptureLossRequest<IgnoredThreat>;
export type IgnoredThreatPass = CaptureLossPass;
export type IgnoredThreatReport = CaptureLossReport<IgnoredThreat>;
export const inspectIgnoredThreat = (position: ReviewPosition, threat: IgnoredThreat, result: ReviewResult) => inspectCaptureLoss(position, threat, result);
export const ignoredThreatConclusion = (threat: IgnoredThreat, passes: IgnoredThreatPass[], turn: "w" | "b") => captureLossConclusion(threat, passes, turn);

/** Adaptateur de la famille existante ; arrêt, budgets et preuves sont communs. */
export class IgnoredThreatVerification extends CaptureLossVerification<IgnoredThreat> {}
