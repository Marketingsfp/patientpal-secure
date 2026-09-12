import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
// Substitui o anexador gerado: este também aceita a sessão guardada no
// navegador quando `getSession()` falha ou devolve vazio momentaneamente.
import { anexarTokenSessao } from "@/lib/auth-token-attacher";

const SERVER_FN_VERSION_MISMATCH = "SERVER_FN_VERSION_MISMATCH";
const SERVER_FN_RELOAD_KEY = "__server_fn_version_reload__";

function isMissingServerFunction(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Invalid server function ID") ||
    (error instanceof TypeError &&
      error.message.includes("Cannot read properties of undefined") &&
      error.message.includes("method"))
  );
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Após uma atualização, uma aba antiga pode chamar o identificador da
    // função da versão anterior. O TanStack falha antes de autenticação,
    // validação ou handler; marcamos apenas esse caso para o cliente atualizar
    // o bundle. Não repetimos a chamada, evitando duplicar qualquer operação.
    if (isMissingServerFunction(error)) {
      console.warn("[server-fn] versão do cliente desatualizada");
      return new Response(SERVER_FN_VERSION_MISMATCH, {
        status: 409,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const recoverStaleServerFunction = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        typeof window !== "undefined" &&
        message.includes(SERVER_FN_VERSION_MISMATCH)
      ) {
        const lastReload = Number(window.sessionStorage.getItem(SERVER_FN_RELOAD_KEY) ?? 0);
        const now = Date.now();
        if (!Number.isFinite(lastReload) || now - lastReload > 30_000) {
          window.sessionStorage.setItem(SERVER_FN_RELOAD_KEY, String(now));
          const url = new URL(window.location.href);
          url.searchParams.set("_v", String(now));
          window.location.replace(url.toString());
          return new Promise<never>(() => undefined);
        }
      }
      throw error;
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [recoverStaleServerFunction, anexarTokenSessao],
}));
