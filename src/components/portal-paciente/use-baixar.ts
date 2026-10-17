import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { gerarLinkArquivo } from "@/lib/portal-paciente/portal-fase2.functions";
import type { TipoLink } from "@/lib/portal-paciente/regras-fase2";

/** Pede um link de 5 minutos ao servidor e abre numa aba nova. */
export function useBaixarPortal(clinica: string | null) {
  const fn = useServerFn(gerarLinkArquivo);
  const [baixando, setBaixando] = useState<string | null>(null);
  const baixar = async (tipo: TipoLink, id: string) => {
    // Abre a aba já no clique (evita bloqueio de pop-up).
    const aba = window.open("about:blank", "_blank");
    setBaixando(`${tipo}:${id}`);
    try {
      const r = await fn({ data: { clinica, tipo, id } });
      if (aba) {
        aba.opener = null;
        aba.location.href = r.url;
      } else window.location.href = r.url;
    } catch (e) {
      aba?.close();
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir.");
    } finally {
      setBaixando(null);
    }
  };
  return { baixar, baixando };
}
