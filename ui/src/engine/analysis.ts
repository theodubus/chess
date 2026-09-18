export type Side = 'w' | 'b';
export type Score = {
  kind: 'cp' | 'mate';
  /** Toujours du point de vue des blancs. */
  value: number;
  bound?: 'lower' | 'upper';
  winner?: Side;
};
export type SearchInfo = { depth: number | null; score: Score | null; pv?: string[] };

function integer(token: string | undefined): number | undefined {
  if (!token || !/^-?\d+$/.test(token)) return;
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Ne lit que profondeur et score ; aucune interprétation de la variante principale. */
export function parseSearchInfo(line: string, turn: Side): Partial<SearchInfo> | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info' || tokens[1] === 'string') return null;
  const end = tokens.findIndex(token => token === 'pv' || token === 'string');
  const fields = end < 0 ? tokens : tokens.slice(0, end);
  const multipv = fields.indexOf('multipv');
  if (multipv >= 0 && fields[multipv + 1] !== '1') return null;
  const result: Partial<SearchInfo> = {};
  const depthIndex = fields.indexOf('depth');
  const depth = depthIndex < 0 ? undefined : integer(fields[depthIndex + 1]);
  if (depth !== undefined && depth >= 0) result.depth = depth;
  const scoreIndex = fields.indexOf('score');
  if (scoreIndex >= 0) {
    const kind = fields[scoreIndex + 1];
    const raw = integer(fields[scoreIndex + 2]);
    if ((kind === 'cp' || kind === 'mate') && raw !== undefined) {
      const score: Score = { kind, value: raw === 0 ? 0 : raw * (turn === 'w' ? 1 : -1) };
      const bound = fields[scoreIndex + 3];
      if (bound === 'lowerbound' || bound === 'upperbound') {
        score.bound = (bound === 'lowerbound') === (turn === 'w') ? 'lower' : 'upper';
      }
      // Un mat à zéro signifie que le camp au trait est déjà maté.
      if (kind === 'mate') score.winner = raw > 0 ? turn : turn === 'w' ? 'b' : 'w';
      result.score = score;
    }
  }
  return Object.keys(result).length ? result : null;
}

export function scoreLabel(score: Score | null) {
  if (!score) return '—';
  const bound = score.bound === 'lower' ? '≥ ' : score.bound === 'upper' ? '≤ ' : '';
  if (score.kind === 'mate') return `${bound}Mat en ${Math.abs(score.value)} · ${score.winner === 'w' ? 'Blancs' : 'Noirs'}`;
  const value = (score.value / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
  return `${bound}${value}`;
}

/** Échelle visuelle saturée en pions, pas une probabilité de victoire. */
export function whiteShare(score: Score | null) {
  if (!score) return 50;
  if (score.kind === 'mate') return score.winner === 'w' ? 100 : 0;
  return Math.min(95, Math.max(5, 50 + 50 * Math.tanh(score.value / 400)));
}

/** La légalité des coups sera vérifiée sur la position de départ par le lecteur de partie. */
export function parsePrincipalVariation(line: string): string[] | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info' || tokens[1] === 'string') return null;
  const index = tokens.indexOf('pv');
  const comment = tokens.indexOf('string');
  const multipv = tokens.indexOf('multipv');
  if (index < 0 || (comment >= 0 && comment < index) || (multipv >= 0 && tokens[multipv + 1] !== '1')) return null;
  const moves = tokens.slice(index + 1);
  if (!moves.length || moves.length > 128 || moves.some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return null;
  return moves;
}
