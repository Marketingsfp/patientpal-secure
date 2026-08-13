import { useEffect, useState } from "react";
import { getPreferenciasUi, updatePreferenciasUi } from "@/lib/cache/prefs-cache";
import { OrcamentosShellV2 } from "./orcamentos-shell";

/**
 * Monta o OrcamentosShellV2 com preferência "modo compacto" persistida em
 * profiles.preferencias_ui.orcamentos.compact. Usado tanto pela rota de
 * preview (/app/dev-orcamentos-shell) quanto pela promoção controlada em
 * /app/orcamentos (apenas admin/gestor com a flag orcamentos_v2 ligada).
 *
 * Não altera nenhuma regra de criação, edição, conversão, impressão,
 * histórico, cobrança, splits ou permissões — apenas apresentação.
 */
export function OrcamentosV2Mount() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const p = prefs as { orcamentos?: { compact?: boolean } };
      if (typeof p.orcamentos?.compact === "boolean") setCompact(p.orcamentos.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    await updatePreferenciasUi((prev) => ({
      ...prev,
      orcamentos: { ...((prev.orcamentos as object) ?? {}), compact: v },
    }));
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="flex-1 min-h-0">
        <OrcamentosShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
      </div>
    </div>
  );
}