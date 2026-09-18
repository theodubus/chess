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
  children,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const readOnly = !onMove;
  useEffect(() => {
    if (!element.current) return;
    const ground = Chessground(element.current, {
      viewOnly: readOnly,
      movable: {
        free: false,
        rookCastle: false,
        events: { after: (from, to) => move.current?.(from, to) },
      },
      premovable: { enabled: false },
      drawable: { enabled: false },
      animation: { enabled: false },
    });
    api.current = ground;
    return () => {
      ground.destroy();
      api.current = null;
    };
  }, [readOnly]);
  useEffect(() => {
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ?? [],
      movable: { color: turn, dests: destinations ?? new Map() },
    });
  }, [fen, orientation, turn, check, lastMove, destinations]);
  return (
    <div className="board-frame">
      <div className="board-surface">
        <div
          ref={element}
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
