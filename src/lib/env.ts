/**
 * Ambiente da aplicação — leitura segura no cliente e no servidor.
 *
 * Valores possíveis:
 *   - "production" (padrão): comportamento normal, integrações reais.
 *   - "lab": ambiente de laboratório. As integrações externas ficam bloqueadas
 *     ou passam por allowlist / mocks.
 *
 * No cliente lemos `import.meta.env.VITE_APP_ENV`. No servidor lemos
 * `process.env.APP_ENV` (ver `env.server.ts`). Enquanto a variável não estiver
 * definida (situação atual em produção), o valor é "production" e nada muda.
 */
export type AppEnv = "production" | "lab";

export function getAppEnv(): AppEnv {
  const raw = (import.meta as any)?.env?.VITE_APP_ENV ?? "production";
  return raw === "lab" ? "lab" : "production";
}

export function isLab(): boolean {
  return getAppEnv() === "lab";
}