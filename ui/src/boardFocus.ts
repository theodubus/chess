import { useEffect, useState, useSyncExternalStore } from "react";

/** Ce que le mode plein écran demande du document — un faux dans les tests. */
export type FullscreenDocument = {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: Element | null;
  readonly documentElement: { requestFullscreen(): Promise<void> };
  exitFullscreen(): Promise<void>;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
  removeEventListener(type: "fullscreenchange", listener: () => void): void;
};

/**
 * Le mode plein écran de la partie : la page en plein écran, comme F11, et
 * le plateau aussi grand que la fenêtre (`html.board-focus` dans le CSS).
 *
 * Les deux vont ensemble mais ne dépendent pas l'un de l'autre. Un
 * navigateur qui refuse le plein écran — Safari sur iPhone, une page dans un
 * cadre — garde le grand plateau. Et quitter le plein écran par Échap, que
 * le navigateur intercepte sans que la page voie la touche, quitte aussi le
 * mode : sinon le grand plateau resterait sans le plein écran qui l'appelait.
 *
 * L'état vit au-dessus de la partie : une revanche remonte la vue de la
 * partie, et le plein écran doit survivre à plusieurs parties d'affilée.
 */
export class BoardFocus {
  active = false;
  private ownsFullscreen = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly doc: FullscreenDocument) {}

  /** Branche le mode sur le document ; rend de quoi le débrancher. */
  connect() {
    this.doc.addEventListener("fullscreenchange", this.onFullscreenChange);
    return () =>
      this.doc.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Appelé dans le geste de l'utilisateur : le navigateur l'exige. */
  toggle = () => {
    if (this.active) this.exit();
    else this.enter();
  };

  private enter() {
    this.active = true;
    this.notify();
    if (!this.doc.fullscreenEnabled || this.doc.fullscreenElement) return;
    this.doc.documentElement.requestFullscreen().then(
      () => {
        // Le mode a pu être quitté pendant que le navigateur obéissait.
        if (this.active) this.ownsFullscreen = true;
        else void this.doc.exitFullscreen().catch(() => {});
      },
      // Refusé : le grand plateau reste, sans plein écran.
      () => {},
    );
  }

  private exit() {
    this.active = false;
    this.notify();
    // Un plein écran que l'utilisateur avait déjà ne nous appartient pas.
    if (this.ownsFullscreen && this.doc.fullscreenElement) {
      this.ownsFullscreen = false;
      void this.doc.exitFullscreen().catch(() => {});
    }
  }

  private onFullscreenChange = () => {
    if (this.doc.fullscreenElement || !this.ownsFullscreen) return;
    this.ownsFullscreen = false;
    if (this.active) {
      this.active = false;
      this.notify();
    }
  };

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}

// Un rendu sans navigateur — les tests rendent l'application en chaîne — n'a
// ni document ni plein écran.
const NO_DOCUMENT: FullscreenDocument = {
  fullscreenEnabled: false,
  fullscreenElement: null,
  documentElement: { requestFullscreen: () => Promise.reject(new Error()) },
  exitFullscreen: () => Promise.resolve(),
  addEventListener: () => {},
  removeEventListener: () => {},
};

/** Le mode de la page, et la classe qui le traduit en mise en page. */
export function useBoardFocus(applies: boolean) {
  const [focus] = useState(
    () =>
      new BoardFocus(typeof document === "undefined" ? NO_DOCUMENT : document),
  );
  useEffect(() => focus.connect(), [focus]);
  const active = useSyncExternalStore(
    focus.subscribe,
    () => focus.active,
    () => false,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("board-focus", active && applies);
    return () => document.documentElement.classList.remove("board-focus");
  }, [active, applies]);
  return { active, toggle: focus.toggle };
}
