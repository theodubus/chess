import type { GameController } from "./GameController";
export function downloadPgn(controller: GameController) {
  const url = URL.createObjectURL(
    new Blob([controller.exportPgn()], {
      type: "application/x-chess-pgn;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "shallowred-partie.pgn";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
