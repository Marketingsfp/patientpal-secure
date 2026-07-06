// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
const createConfig = defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
});

export default async function config(env: { command: "build" | "serve"; mode: string }) {
  const resolved = await createConfig(env);

  if (env.command === "serve" && env.mode === "development") {
    // The source injector calculates different line metadata for the SSR and
    // browser transforms, causing a React hydration mismatch on every page.
    // Lovable's own component tagger remains enabled.
    resolved.plugins = ((resolved.plugins ?? []) as unknown[]).flat(Infinity)
      .filter((plugin): plugin is Plugin => !!plugin && typeof plugin === "object")
      .filter((plugin) => plugin.name !== "@tanstack/devtools:inject-source");
  }

  return resolved;
}
