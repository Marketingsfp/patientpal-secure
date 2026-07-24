import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Detecta quando um novo bundle foi publicado (novo deploy) enquanto a aba
 * está aberta e recarrega automaticamente para evitar código antigo em cache.
 *
 * Como funciona:
 * - Faz um fetch do `index.html` (com `cache: "no-store"`) na montagem e
 *   periodicamente enquanto a aba está visível.
 * - Extrai o hash do script principal (arquivo `assets/*.js` que o Vite
 *   injeta) e compara com o primeiro visto na sessão.
 * - Se mudar, avisa e chama `location.reload()` uma única vez.
 *
 * Seguro em dev (Vite injeta `/src/entry-client.tsx` sem hash — nesse caso
 * o valor extraído é estável e nada dispara).
 */
const STORAGE_KEY = "__build_hash_seen__";
const CHECK_INTERVAL_MS = 60_000;

function extractMainScript(html: string): string | null {
  // Procura tags <script ... src="/assets/xxx.js"> ou entry-client
  const matches = Array.from(
    html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi),
  );
  if (matches.length === 0) return null;
  // Ordena para pegar o mais estável (o último costuma ser o entry principal)
  return matches.map((m) => m[1]).sort().join("|");
}

let reloading = false;

export function useAutoReloadOnNewBuild(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    const check = async () => {
      if (reloading || document.hidden) return;
      try {
        const res = await fetch(`/?_cb=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const html = await res.text();
        const current = extractMainScript(html);
        if (!current) return;
        const seen = sessionStorage.getItem(STORAGE_KEY);
        if (!seen) {
          sessionStorage.setItem(STORAGE_KEY, current);
          return;
        }
        if (seen !== current && !cancelled) {
          reloading = true;
          sessionStorage.setItem(STORAGE_KEY, current);
          toast.info("Atualizando para a nova versão do sistema...");
          setTimeout(() => {
            // reload(true) foi descontinuado; forçamos com cache-bust na URL
            const url = new URL(window.location.href);
            url.searchParams.set("_v", String(Date.now()));
            window.location.replace(url.toString());
          }, 800);
        }
      } catch {
        // silencioso — offline ou rede instável não deve incomodar o usuário
      }
    };

    void check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}