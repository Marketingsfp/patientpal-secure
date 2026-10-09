import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PRESETS, type Acesso } from "./permissoes-presets";
import { aplicarExcecoesDaPessoa } from "./permissoes-pessoa";
import { nivelDoModulo } from "./permissoes-rotas";
import { TELAS_OSZAP } from "./permissoes-oszap";
import { podeAbrirTelaOsZap } from "./atendimento/acesso-telas-oszap";

/** Mesma herança da matriz, com vínculo ativo e consultas que falham fechadas. */
export async function carregarAcessosOsZap(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
): Promise<Record<string, Acesso>> {
  const membro = await db
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (membro.error) throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  if (!membro.data) throw new Error("Sem acesso a esta clínica");
  const role = membro.data.role;
  if (role === "admin") return Object.fromEntries(TELAS_OSZAP.map((t) => [t.key, "write"]));
  const perfil = await db
    .from("perfis_acesso")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("chave", role)
    .maybeSingle();
  if (perfil.error) throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  const regras = perfil.data
    ? await db.from("perfil_permissoes").select("modulo, acesso").eq("perfil_id", perfil.data.id)
    : { data: [], error: null };
  const pessoa = await db
    .from("usuario_permissoes")
    .select("modulo, acesso")
    .eq("clinica_id", clinicaId)
    .eq("user_id", userId);
  if (regras.error || pessoa.error)
    throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  const base = {
    allowed: new Set<string>(),
    nivel: new Map<string, "read" | "write">(),
    configured: new Set<string>(),
  };
  const preset = (PRESETS as Record<string, Partial<Record<string, Acesso>>>)[role] ?? {};
  aplicarExcecoesDaPessoa(base, regras.data);
  for (const [modulo, acesso] of Object.entries(preset)) {
    if (!base.configured.has(modulo)) {
      if (acesso === "none") base.configured.add(modulo);
      else if (acesso) {
        base.allowed.add(modulo);
        base.nivel.set(modulo, acesso);
      }
    }
  }
  aplicarExcecoesDaPessoa(base, pessoa.data);
  return Object.fromEntries(
    TELAS_OSZAP.map((t) => [
      t.key,
      podeAbrirTelaOsZap(role, t.to, t.hash)
        ? nivelDoModulo(t.key, base.allowed, base.nivel, base.configured)
        : "none",
    ]),
  );
}
