import { useEffect, useState } from "react";
import { getPreferenciasUi, updatePreferenciasUi } from "@/lib/cache/prefs-cache";
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
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const p = prefs as { caixa?: { compact?: boolean } };
      if (typeof p.caixa?.compact === "boolean") setCompact(p.caixa.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    await updatePreferenciasUi((prev) => ({
      ...prev,
      caixa: { ...((prev.caixa as object) ?? {}), compact: v },
    }));
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="flex-1 min-h-0">
        <CaixaShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
      </div>
    </div>
  );
}