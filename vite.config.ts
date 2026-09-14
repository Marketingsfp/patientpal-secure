// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { relative } from "node:path";
import type { Plugin } from "vite";
import { calcularFingerprintNina, fonteDoRuntimeNina } from "./scripts/nina-runtime-fingerprint";

function ninaRuntimeFingerprint(): Plugin {
  let raiz = "";
  return {
    name: "nina-runtime-fingerprint",
    config(config) {
      raiz = config.root ?? process.cwd();
      return {
        define: { __NINA_SOURCE_FINGERPRINT__: JSON.stringify(calcularFingerprintNina(raiz)) },
      };
    },
    configureServer(server) {
      // `define` é fixo por inicialização. Recarregar só o módulo alterado por HMR
      // deixaria a versão antiga identificando fontes novos no preview do Lovable.
      let pendente: ReturnType<typeof setTimeout> | undefined;
      const mudou = (_evento: string, arquivo: string) => {
        if (!fonteDoRuntimeNina(relative(raiz, arquivo))) return;
        clearTimeout(pendente);
        pendente = setTimeout(() => {
          void server.restart().catch((erro: unknown) => {
            server.config.logger.error(`Falha ao atualizar fingerprint da Nina: ${String(erro)}`);
          });
        }, 100);
      };
      server.watcher.on("all", mudou);
      server.httpServer?.once("close", () => {
        clearTimeout(pendente);
        server.watcher.off("all", mudou);
      });
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin(), ninaRuntimeFingerprint()],
  },
});
