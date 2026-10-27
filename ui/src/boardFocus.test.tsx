import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardFocus, type FullscreenDocument } from "./boardFocus";
import GameView from "./GameView";
import { GameController } from "./GameController";

/** Un document dont on règle le plein écran, et qui dit ce qu'on lui a demandé. */
function fakeDocument({ enabled = true, refuse = false } = {}) {
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  let resolveRequest = () => {};
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: null as Element | null,
    documentElement: {
      requestFullscreen() {
        calls.push("request");
        if (refuse) return Promise.reject(new Error("refusé"));
        return new Promise<void>((resolve) => {
          resolveRequest = () => {
            doc.fullscreenElement = {} as Element;
            for (const listener of [...listeners]) listener();
            resolve();
          };
        });
      },
    },
    exitFullscreen() {
      calls.push("exit");
      doc.fullscreenElement = null;
      for (const listener of [...listeners]) listener();
      return Promise.resolve();
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  // Échap : le navigateur quitte le plein écran sans passer par la page.
  const escape = () => {
    doc.fullscreenElement = null;
    for (const listener of [...listeners]) listener();
  };
  const grant = () => resolveRequest();
  return { doc: doc as FullscreenDocument & typeof doc, calls, listeners, escape, grant };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it("demande le plein écran à l'entrée et le rend à la sortie", async () => {
  const { doc, calls, grant } = fakeDocument();
  const focus = new BoardFocus(doc);
  focus.connect();
  let notified = 0;
  focus.subscribe(() => notified++);
  focus.toggle();
  expect(focus.active).toBe(true);
  expect(calls).toEqual(["request"]);
  grant();
  await settle();
  focus.toggle();
  expect(focus.active).toBe(false);
  expect(calls).toEqual(["request", "exit"]);
  expect(notified).toBe(2);
});

it("quitter le plein écran par Échap quitte aussi le mode", async () => {
  const { doc, escape, grant } = fakeDocument();
  const focus = new BoardFocus(doc);
  focus.connect();
  focus.toggle();
  grant();
  await settle();
  expect(focus.active).toBe(true);
  escape();
  expect(focus.active).toBe(false);
});

it("garde le grand plateau quand le navigateur refuse ou ignore le plein écran", async () => {
  for (const options of [{ refuse: true }, { enabled: false }]) {
    const { doc, calls } = fakeDocument(options);
    const focus = new BoardFocus(doc);
    focus.connect();
    focus.toggle();
    await settle();
    expect(focus.active).toBe(true);
    focus.toggle();
    expect(focus.active).toBe(false);
    expect(calls).not.toContain("exit");
  }
});

it("ne rend pas un plein écran qu'il n'a pas demandé", () => {
  const { doc, calls, escape } = fakeDocument();
  doc.fullscreenElement = {} as Element;
  const focus = new BoardFocus(doc);
  focus.connect();
  focus.toggle();
  expect(calls).toEqual([]);
  focus.toggle();
  expect(calls).toEqual([]);
  // Et un plein écran quitté qui n'était pas le sien ne touche pas au mode.
  focus.toggle();
  escape();
  expect(focus.active).toBe(true);
});

it("sorti du mode avant que le navigateur obéisse, il rend le plein écran aussitôt accordé", async () => {
  const { doc, calls, grant } = fakeDocument();
  const focus = new BoardFocus(doc);
  focus.connect();
  focus.toggle();
  focus.toggle();
  grant();
  await settle();
  expect(focus.active).toBe(false);
  expect(calls).toEqual(["request", "exit"]);
  expect(doc.fullscreenElement).toBeNull();
});

it("débranché, il n'écoute plus le document", () => {
  const { doc, listeners } = fakeDocument();
  const disconnect = new BoardFocus(doc).connect();
  expect(listeners.size).toBe(1);
  disconnect();
  expect(listeners.size).toBe(0);
});

it("la partie propose le plein écran seulement quand l'application le gère", () => {
  const props = {
    controller: new GameController(),
    showEvaluation: false,
    onEvaluation: () => {},
    onNew: () => {},
    onRematch: () => {},
    onReview: () => {},
  };
  expect(renderToStaticMarkup(<GameView {...props} />)).not.toContain(
    "focus-toggle",
  );
  const off = renderToStaticMarkup(
    <GameView {...props} onToggleFocus={() => {}} />,
  );
  expect(off).toContain('aria-pressed="false"');
  expect(off).toContain(">Plein écran<");
  const on = renderToStaticMarkup(
    <GameView {...props} focus onToggleFocus={() => {}} />,
  );
  expect(on).toContain('aria-pressed="true"');
  expect(on).toContain(">Quitter le plein écran<");
});
