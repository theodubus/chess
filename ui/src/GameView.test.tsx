import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GameView from "./GameView";
import { GameController } from "./GameController";
import EvaluationBar from "./EvaluationBar";
import App from "./App";
import GameSetup from "./GameSetup";
import { DEFAULT_SETUP } from "./preferences";
import type { SessionSnapshot } from "./engine/UciSession";

const snapshot: SessionSnapshot = {
  state: "thinking",
  name: "Test",
  error: "",
  log: [],
  analysis: { depth: 12, score: { kind: "cp", value: 125 } },
};

it("prépare le troisième mode avec deux moteurs et sans réglages de joueur humain", () => {
  const html = renderToStaticMarkup(<GameSetup initial={{ ...DEFAULT_SETUP, opponent: "match" }}
    busy={false} error="" onStart={() => {}} onCancel={() => {}} />);
  expect(html).toContain("Deux moteurs");
  expect(html).toContain('aria-label="Moteur des Blancs"');
  expect(html).toContain('aria-label="Moteur des Noirs"');
  expect(html).toContain("Options des Blancs");
  expect(html).toContain("Options des Noirs");
  expect(html).toContain("Lancer le match");
  expect(html).toContain("Cadence différente pour les Noirs");
  expect(html).not.toContain("Votre camp");
  expect(html).not.toContain("Éditer le camp");
  expect(html).not.toContain("cg-wrap");
});

it("présente les deux moteurs et les commandes spectateur, avec les indices masqués par défaut", () => {
  const controller = new GameController(); controller.mode = "match";
  controller.snapshot = snapshot;
  vi.spyOn(controller, "snapshotFor").mockImplementation(color => ({ ...snapshot, name: color === "w" ? "ShallowRed" : "Stockfish" }));
  const props = { controller, showEvaluation: false, onEvaluation: () => {}, onNew: () => {}, onRematch: () => {}, onReview: () => {} };
  const html = renderToStaticMarkup(<GameView {...props} />);
  expect(html).toContain("ShallowRed"); expect(html).toContain("Stockfish");
  expect(html).toContain("Mettre en pause"); expect(html).toContain("Arrêter le match");
  expect(html).not.toContain("Abandonner"); expect(html).not.toContain("Profondeur 12");
  expect(html).not.toContain('class="evaluation-bar');
  controller.pauseMatch();
  const paused = renderToStaticMarkup(<GameView {...props} />);
  expect(paused).toContain("Match en pause"); expect(paused).toContain("Reprendre le match");
  controller.stopMatch();
  const stopped = renderToStaticMarkup(<GameView {...props} />);
  expect(stopped).toContain("Sans résultat");
  expect(stopped).toContain('title="Aucun coup à analyser"');
  expect(stopped).not.toContain("Temps écoulé");
});
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
    "Prises des Blancs : 1 pion ; avantage matériel de 1 point",
  );
  expect(html).toContain(">+1</strong>");
  expect(html).not.toContain('class="evaluation-bar');
});

it("met à jour le +N après une promotion même sans prise ni évaluation moteur", () => {
  const controller = new GameController({
    initialFen: "1r5k/P7/8/8/8/8/8/7K w - - 0 1",
  });
  const render = () =>
    renderToStaticMarkup(
      <GameView
        controller={controller}
        showEvaluation={false}
        onEvaluation={() => {}}
        onNew={() => {}}
        onRematch={() => {}}
        onReview={() => {}}
      />,
    );
  expect(render()).toContain(
    "Prises des Noirs : aucune ; avantage matériel de 4 points",
  );
  expect(controller.move("a7", "a8")).toBe(true);
  expect(render()).toContain(
    "Prises des Noirs : aucune ; avantage matériel de 4 points",
  );
  controller.promote("q");
  expect(render()).toContain(
    "Prises des Blancs : aucune ; avantage matériel de 4 points",
  );
  expect(controller.move("b8", "a8")).toBe(true);
  expect(render()).toContain(
    "Prises des Noirs : 1 dame ; avantage matériel de 5 points",
  );
});
