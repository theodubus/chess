import { CaptureLossVerification, type CaptureLossReport, type CaptureLossRequest } from "./CaptureLossVerification";
import type { MovedPieceExposure } from "./movedPieceExposure";
export type MovedPieceRequest = CaptureLossRequest<MovedPieceExposure>;
export type MovedPieceReport = CaptureLossReport<MovedPieceExposure>;
export class MovedPieceVerification extends CaptureLossVerification<MovedPieceExposure> {}
