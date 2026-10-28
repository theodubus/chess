import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const developmentTransport = fileURLToPath(
  new URL("./src/engine/DevelopmentEngine.ts", import.meta.url),
);
const webTransport = fileURLToPath(
  new URL("./src/engine/WebEngine.ts", import.meta.url),
);

/**
 * La version web (GitHub Pages) : chaque import du pont local devient le
 * transport WebAssembly. Un seul fichier change de rôle ; les composants
 * n'en savent rien, et les autres modes n'en voient rien.
 */
function webEngineTransport(): Plugin {
  return {
    name: "shallowred-web-transport",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.includes("DevelopmentEngine") || importer === webTransport)
        return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      return resolved?.id === developmentTransport ? webTransport : null;
    },
  };
}

/**
 * L'isolation de la version web : le service worker qui pose COOP et COEP
 * (`pages/coi-sw.js`), émis à la racine du site, et son enregistrement,
 * en tête de la page. Sans eux, pas de mémoire partagée, donc pas de
 * moteur à plusieurs fils sur GitHub Pages.
 */
function crossOriginIsolation(): Plugin {
  const source = (file: string) =>
    readFileSync(new URL(`./pages/${file}`, import.meta.url), "utf8");
  return {
    name: "shallowred-cross-origin-isolation",
    transformIndexHtml: () => [
      {
        tag: "script",
        children: source("register-coi-sw.js"),
        injectTo: "head-prepend",
      },
    ],
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "coi-sw.js",
        source: source("coi-sw.js"),
      });
    },
  };
}

export default defineConfig(({ mode }) =>
  mode === "pages"
    ? {
        plugins: [react(), webEngineTransport(), crossOriginIsolation()],
        // Adresses relatives : la page vit sous /<dépôt>/ sur GitHub Pages.
        base: "./",
      }
    : {
        plugins: [react()],
        server: { host: "127.0.0.1", strictPort: true },
      },
);
