/**
 * Utilitários de ambiente para código server-side (createServerFn / rotas api).
 *
 * Só rode este módulo no servidor — está bloqueado do bundle do browser pelo
 * sufixo `.server.ts`.
 */
import type { AppEnv } from "./env";

export function getServerAppEnv(): AppEnv {
  const raw = process.env.APP_ENV ?? "production";
  return raw === "lab" ? "lab" : "production";
}

export function isServerLab(): boolean {
  return getServerAppEnv() === "lab";
}

/**
 * Guard para operações reais que NUNCA podem rodar no laboratório
 * (envio real de WhatsApp, emissão de NFS-e real, cobrança real, etc.).
 *
 * Uso:
 *   assertNotLabForRealOps("emitir NFS-e");
 *
 * Em produção (APP_ENV != "lab") é no-op.
 * No lab, lança erro e impede a chamada externa.
 */
export function assertNotLabForRealOps(operacao: string): void {
  if (isServerLab()) {
    throw new Error(
      `[LAB] Operação real bloqueada no ambiente de laboratório: ${operacao}. ` +
        `Use o mock correspondente ou libere o destino via lab_allowlist_contatos.`,
    );
  }
}

/**
 * Verifica se um destino (telefone/email) está liberado pela allowlist do lab.
 * Em produção retorna sempre `true` — não consulta o banco.
 */
export async function isLabAllowedDestino(
  destino: string,
  tipo: "telefone" | "email",
): Promise<boolean> {
  if (!isServerLab()) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalizado = destino.trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("lab_allowlist_contatos" as any)
    .select("id")
    .eq("tipo", tipo)
    .eq("valor", normalizado)
    .maybeSingle();
  if (error) return false;
  return !!data;
}