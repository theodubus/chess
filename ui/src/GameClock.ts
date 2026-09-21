export type ClockColor = 'w' | 'b';
export type TimeControl = { initialMs: number; incrementMs: number };
export type ClockState = { remaining: Record<ClockColor, number>; started: boolean; flagged: ClockColor | null; active: ClockColor | null; running: boolean };
export type ClockBudget = { wtime: number; btime: number; winc: number; binc: number };

export const DEFAULT_TIME_CONTROL: TimeControl = { initialMs: 300_000, incrementMs: 3000 };
export const TIME_CONTROLS = [
  { label: '1 min', initialMs: 60_000, incrementMs: 0 },
  { label: '2 min + 1 s', initialMs: 120_000, incrementMs: 1000 },
  { label: '3 min', initialMs: 180_000, incrementMs: 0 },
  { label: '3 min + 2 s', initialMs: 180_000, incrementMs: 2000 },
  { label: '5 min', initialMs: 300_000, incrementMs: 0 },
  { label: '5 min + 3 s', ...DEFAULT_TIME_CONTROL },
  { label: '10 min', initialMs: 600_000, incrementMs: 0 },
  { label: '10 min + 5 s', initialMs: 600_000, incrementMs: 5000 },
  { label: '15 min + 10 s', initialMs: 900_000, incrementMs: 10_000 },
  { label: '30 min', initialMs: 1_800_000, incrementMs: 0 },
  { label: '60 min', initialMs: 3_600_000, incrementMs: 0 },
];

export function parseTimeControl(minutes: string, increment: string): TimeControl | null {
  if (!minutes.trim() || !increment.trim()) return null;
  const duration = Number(minutes);
  const seconds = Number(increment);
  if (!Number.isFinite(duration) || duration < 0.5 || duration > 180 || !Number.isInteger(duration * 2) ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 60) return null;
  return { initialMs: duration * 60_000, incrementMs: seconds * 1000 };
}

/** Le temps écoulé est mesuré, jamais déduit du nombre de rafraîchissements. */
export class GameClock {
  private stored: Record<ClockColor, number>;
  private since: number | null = null;
  private active: ClockColor | null = null;
  started = false;
  flagged: ClockColor | null = null;

  constructor(public control: TimeControl = DEFAULT_TIME_CONTROL, private now = () => performance.now()) {
    this.stored = { w: control.initialMs, b: control.initialMs };
  }

  get runningColor() { return this.since === null ? null : this.active; }

  get remaining(): Record<ClockColor, number> {
    const result = { ...this.stored };
    if (this.active && this.since !== null) {
      result[this.active] = Math.max(0, result[this.active] - Math.max(0, this.now() - this.since));
    }
    return result;
  }

  update() {
    const now = this.now();
    if (this.active && this.since !== null) {
      this.stored[this.active] = Math.max(0, this.stored[this.active] - Math.max(0, now - this.since));
      this.since = now;
      if (this.stored[this.active] === 0) {
        this.flagged = this.active;
        this.active = null;
        this.since = null;
      }
    }
  }

  start(color: ClockColor) {
    if (this.flagged || this.started) return;
    this.started = true;
    this.resume(color);
  }

  resume(color: ClockColor) {
    if (!this.started || this.flagged || this.since !== null) return;
    this.active = color;
    this.since = this.now();
  }

  pause() { this.update(); this.since = null; }

  // Le contrôleur a déjà mesuré le temps à la réception du coup avec update().
  completeMove(color: ClockColor, finished: boolean) {
    if (this.flagged) return;
    this.stored[color] += this.control.incrementMs;
    this.active = finished ? null : color === 'w' ? 'b' : 'w';
    this.since = finished ? null : this.since ?? this.now();
  }

  reset(control = this.control) {
    this.control = control;
    this.stored = { w: control.initialMs, b: control.initialMs };
    this.active = null;
    this.since = null;
    this.started = false;
    this.flagged = null;
  }

  capture(): ClockState {
    return { remaining: this.remaining, started: this.started, flagged: this.flagged, active: this.active, running: this.since !== null };
  }

  restore(state: ClockState) {
    this.stored = { ...state.remaining };
    this.started = state.started;
    this.flagged = state.flagged;
    this.active = state.active;
    this.since = state.running ? this.now() : null;
  }

  budget(): ClockBudget {
    const remaining = this.remaining;
    return {
      wtime: Math.max(0, Math.floor(remaining.w)),
      btime: Math.max(0, Math.floor(remaining.b)),
      winc: this.control.incrementMs,
      binc: this.control.incrementMs,
    };
  }
}

export function formatTime(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
