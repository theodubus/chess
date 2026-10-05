import type { ReviewPosition } from "../model";
import type { IgnoredThreatReport } from "./IgnoredThreatVerification";
import { captureLossDraftWork } from "./captureLossDraft";
import { finishWork } from "./work";

export const ignoredThreatDraftWork = (position: ReviewPosition, report: IgnoredThreatReport) => captureLossDraftWork(position, report);
export const ignoredThreatDraft = (position: ReviewPosition, report: IgnoredThreatReport) => finishWork(ignoredThreatDraftWork(position, report));
