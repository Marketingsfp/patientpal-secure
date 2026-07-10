import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaixaShellV2 } from "./caixa-shell";

/**
 * Monta o CaixaShellV2 com preferência de "modo compacto" persistida em
 * profiles.preferencias_ui.caixa.compact. Usado tanto pela rota de preview
 * (`/app/dev-caixa-shell`) quanto pela promoção controlada em `/app/caixa`.
 *
 * Não altera nenhuma regra financeira — apenas apresentação + atalho
 * `?receber=<agendamentoId>` que o clássico consome.
 */
export function CaixaV2Mount() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferencias_ui")
        .eq("id", u.user.id)
        .maybeSingle();
      const p = (data?.preferencias_ui ?? {}) as { caixa?: { compact?: boolean } };
      if (typeof p.caixa?.compact === "boolean") setCompact(p.caixa.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", u.user.id)
      .maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const caixa = { ...((prev.caixa as object) ?? {}), compact: v };
    await supabase
      .from("profiles")
      .update({ preferencias_ui: { ...prev, caixa } })
      .eq("id", u.user.id);
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="flex-1 min-h-0">
        <CaixaShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
      </div>
    </div>
  );
}
