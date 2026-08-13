import { supabase } from "@/integrations/supabase/client";
import { makeCache } from "./single-flight";

/**
 * Leitura compartilhada de `profiles.preferencias_ui` do usuário logado.
 *
 * Antes, cada hook de feature flag (agenda_v2, caixa_v2, clientes_v2,
 * orcamentos_v2, ub_v1, ordem do menu...) fazia o SEU próprio SELECT em
 * `profiles` a cada montagem — 7 a 9 requisições idênticas por tela.
 * Agora todos compartilham a mesma leitura (com dedupe das chamadas em voo).
 */
export type PrefsUi = Record<string, unknown>;
type PrefsState = { uid: string | null; prefs: PrefsUi };

const cache = makeCache<PrefsState>(30_000);

export function getPreferenciasUi(): Promise<PrefsState> {
  return cache.get("me", async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    if (!uid) return { uid: null, prefs: {} };
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", uid)
      .maybeSingle();
    return { uid, prefs: (data?.preferencias_ui ?? {}) as PrefsUi };
  });
}

export function invalidatePreferenciasUi(): void {
  cache.invalidate();
}

/** Lê a flag booleana em `preferencias_ui.flags[nome]`. */
export async function getFlagUsuario(nome: string): Promise<boolean | undefined> {
  const { prefs } = await getPreferenciasUi();
  const flags = (prefs.flags ?? {}) as Record<string, boolean | undefined>;
  return flags[nome];
}

/** Grava a flag no perfil e atualiza o cache local (sem reler o banco). */
export async function setFlagUsuario(nome: string, valor: boolean): Promise<void> {
  const { uid, prefs } = await getPreferenciasUi();
  if (!uid) return;
  const flags = { ...((prefs.flags as object) ?? {}), [nome]: valor };
  const next = { ...prefs, flags };
  await supabase.from("profiles").update({ preferencias_ui: next }).eq("id", uid);
  invalidatePreferenciasUi();
}

/** Atualiza `preferencias_ui` inteiro a partir do valor atual. */
export async function updatePreferenciasUi(
  patch: (prev: PrefsUi) => PrefsUi,
): Promise<void> {
  const { uid, prefs } = await getPreferenciasUi();
  if (!uid) return;
  await supabase
    .from("profiles")
    .update({ preferencias_ui: patch(prefs) as never })
    .eq("id", uid);
  invalidatePreferenciasUi();
}
