import { useEffect, useRef, type ReactNode } from "react";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Key } from "@lichess-org/chessground/types";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type Props = {
  fen: string;
  orientation: Color;
  turn: Color;
  check?: boolean;
  lastMove?: Key[];
  destinations?: Map<Key, Key[]>;
  onMove?: (from: Key, to: Key) => void;
  movableColor?: Color;
  premoveEnabled?: boolean;
  premove?: { from: Key; to: Key } | null;
  onPremove?: (from: Key, to: Key) => boolean;
  onCancelPremove?: () => void;
  children?: ReactNode;
};
export default function Board({
  fen,
  orientation,
  turn,
  check = false,
  lastMove,
  destinations,
  onMove,
  movableColor,
  premoveEnabled = false,
  premove = null,
  onPremove,
  onCancelPremove,
  children,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const premoveHandlers = useRef({ onPremove, onCancelPremove });
  premoveHandlers.current = { onPremove, onCancelPremove };
  const previousFen = useRef<string | null>(null);
  const readOnly = !onMove;
  useEffect(() => {
    if (!element.current) return;
    const ground = Chessground(element.current, {
      // viewOnly désactive aussi le dessin ; les déplacements sont limités séparément.
      viewOnly: false,
      disableContextMenu: true,
      movable: {
        free: false,
        rookCastle: false,
        events: { after: (from, to) => move.current?.(from, to) },
      },
      premovable: {
        enabled: false,
        events: {
          set: (from, to) => {
            if (!premoveHandlers.current.onPremove?.(from, to))
              api.current?.cancelPremove();
          },
          unset: () => premoveHandlers.current.onCancelPremove?.(),
        },
      },
      drawable: { enabled: true, visible: true },
      animation: { enabled: false },
    });
    api.current = ground;
    return () => {
      ground.destroy();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    const ground = api.current;
    if (!ground) return;
    const shapes =
      previousFen.current === fen ? ground.state.drawable.shapes : [];
    previousFen.current = fen;
    ground.set({
      fen,
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ?? [],
      movable: {
        color: readOnly ? undefined : (movableColor ?? turn),
        dests: destinations ?? new Map(),
      },
      premovable: { enabled: premoveEnabled },
      drawable: { shapes },
    });
    if (readOnly) ground.selectSquare(null);
  }, [
    fen,
    orientation,
    turn,
    check,
    lastMove,
    destinations,
    readOnly,
    movableColor,
    premoveEnabled,
  ]);
  useEffect(() => {
    if (!premoveEnabled || !premove) api.current?.cancelPremove();
  }, [premoveEnabled, premove]);
  return (
    <div className="board-frame">
      <div className="board-surface">
        <div
          ref={element}
          tabIndex={0}
          title="Clic droit glissé : dessiner une flèche. Clic droit sur une case : cercle."
          className="cg-wrap"
          aria-label={
            readOnly
              ? "Échiquier d’analyse en lecture seule"
              : "Échiquier : sélectionner une pièce puis sa destination"
          }
        />
        {children}
      </div>
    </div>
  );
}
