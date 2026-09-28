import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GameView from "./GameView";
import { GameController } from "./GameController";
import EvaluationBar from "./EvaluationBar";
import App from "./App";
import type { SessionSnapshot } from "./engine/UciSession";

const snapshot: SessionSnapshot = {
  state: "thinking",
  name: "Test",
  error: "",
  log: [],
  analysis: { depth: 12, score: { kind: "cp", value: 125 } },
};
afterEach(() => vi.unstubAllGlobals());

it("place les actions de fin de partie sur la surface du plateau et permet de masquer le résultat", () => {
  const controller = new GameController();
  for (const [from, to] of [
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ] as const)
    controller.move(from, to);
  expect(controller.finished).toBe(true);
  const html = renderToStaticMarkup(
    <GameView
      controller={controller}
      showEvaluation={false}
      onEvaluation={() => {}}
      onNew={() => {}}
      onRematch={() => {}}
      onReview={() => {}}
    />,
  );
  expect(html).toContain('class="board-result"');
  expect(html).toContain("Masquer le résultat");
  expect(html).toContain("Analyser la partie");
  expect(html.indexOf('class="board-result"')).toBeLessThan(
    html.indexOf('class="play-controls"'),
  );
  expect(html).toContain(">Résultat</button>");
});

it("masque score et profondeur par défaut et permet des préférences indépendantes", () => {
  const controller = new GameController();
  controller.mode = "local";
  controller.snapshot = snapshot;
  const props = {
    controller,
    onEvaluation: () => {},
    onNew: () => {},
    onRematch: () => {},
    onReview: () => {},
  };
  const hidden = renderToStaticMarkup(
    <GameView {...props} showEvaluation={false} />,
  );
  expect(hidden).not.toContain("+1,25");
  expect(hidden).not.toContain("Profondeur");
  expect(hidden).not.toContain("Annuler");
  expect(hidden).not.toContain("Refaire");
  const visible = renderToStaticMarkup(<GameView {...props} showEvaluation />);
  expect(visible).toContain("+1,25");
  expect(visible).not.toContain("Profondeur 12");
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "chess-ui.depth.play" ? "true" : null),
  });
  const depthOnly = renderToStaticMarkup(
    <GameView {...props} showEvaluation={false} />,
  );
  expect(depthOnly).toContain("Profondeur 12");
  expect(depthOnly).not.toContain("+1,25");
});

it("affiche uniquement la préparation au chargement, quelle que soit la préférence", () => {
  for (const preference of ["true", "false"]) {
    vi.stubGlobal("localStorage", { getItem: () => preference });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Préparer une partie");
    expect(html).not.toContain("cg-wrap");
    expect(html).not.toContain("adversaire de test");
  }
});

it("suit l’orientation de l’échiquier sans inverser le score", () => {
  const score = snapshot.analysis!.score;
  const white = renderToStaticMarkup(
    <EvaluationBar score={score} orientation="white" />,
  );
  const black = renderToStaticMarkup(
    <EvaluationBar score={score} orientation="black" />,
  );
  expect(white).toContain("bottom:0");
  expect(black).toContain("top:0");
  expect(white).toContain("+1,25");
  expect(black).toContain("+1,25");
});

it("ne présente pas une absence de score comme une égalité", () => {
  const bar = renderToStaticMarkup(
    <EvaluationBar score={null} orientation="white" />,
  );
  expect(bar).toContain("Évaluation indisponible");
  expect(bar).toContain("unavailable");
});

it("écrit le score dans la barre et indique le mat du bon camp après retournement", () => {
  for (const orientation of ["white", "black"] as const) {
    const cp = renderToStaticMarkup(
      <EvaluationBar
        score={{ kind: "cp", value: -230 }}
        orientation={orientation}
      />,
    );
    expect(cp).toContain('class="evaluation-score for-black"');
    expect(cp).toContain(">-2,30</span>");
    const mate = renderToStaticMarkup(
      <EvaluationBar
        score={{ kind: "mate", value: -3, winner: "b" }}
        orientation={orientation}
      />,
    );
    expect(mate).toContain(">M3</span>");
    expect(mate).toContain("Mat en 3 · Noirs");
    expect(mate).toContain(`${orientation === "white" ? "top" : "bottom"}:5px`);
  }
  const mated = renderToStaticMarkup(
    <EvaluationBar
      score={{ kind: "mate", value: 0, winner: "w" }}
      orientation="white"
    />,
  );
  expect(mated).toContain(">Mat</span>");
  const bound = renderToStaticMarkup(
    <EvaluationBar
      score={{ kind: "cp", value: 150, bound: "lower" }}
      orientation="white"
    />,
  );
  expect(bound).toContain(">≥ +1,50</span>");
});

it("affiche les prises pendant le jeu même quand l’évaluation moteur est masquée", () => {
  const controller = new GameController();
  for (const [from, to] of [
    ["e2", "e4"],
    ["d7", "d5"],
    ["e4", "d5"],
  ] as const)
    expect(controller.move(from, to)).toBe(true);
  const html = renderToStaticMarkup(
    <GameView
      controller={controller}
      showEvaluation={false}
      onEvaluation={() => {}}
      onNew={() => {}}
      onRematch={() => {}}
      onReview={() => {}}
    />,
  );
  expect(html).toContain(
    "Prises des Blancs : 1 pion ; avantage en prises de 1 point",
  );
  expect(html).toContain(">+1</strong>");
  expect(html).not.toContain('class="evaluation-bar');
});
