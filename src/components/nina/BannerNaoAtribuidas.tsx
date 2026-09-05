import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listarFilaHumana } from "@/lib/atendimento.functions";
import { cn } from "@/lib/utils";

/** Chave lida pela caixa de entrada quando a tela abre pelo banner. */
export const FILTRO_NAO_ATRIBUIDAS_KEY = "nina.inbox.filtrar-nao-atribuidas";
export const EVENTO_FILTRAR_NAO_ATRIBUIDAS = "nina:filtrar-nao-atribuidas";

/**
 * Sinalização de urgência no cabeçalho: mostra quantas conversas ainda estão
 * sem atendente. Some por completo quando a fila zera.
 */
export function BannerNaoAtribuidas() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listarFn = useServerFn(listarFilaHumana);
  const navigate = useNavigate();
  const [total, setTotal] = useState(0);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setTotal(0);
      return;
    }
    try {
      const r = (await listarFn({ data: { clinicaId, limit: 200 } })) as unknown as unknown[];
      setTotal(Array.isArray(r) ? r.length : 0);
    } catch {
      /* silencioso: é um indicador, não pode atrapalhar o cabeçalho */
    }
  }, [clinicaId, listarFn]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 20000);
    return () => clearInterval(t);
  }, [carregar]);

  useRealtimeRefresh(["atend_conversas"], carregar, Boolean(clinicaId));

  if (total <= 0) return null;

  const nivel = total >= 10 ? "critico" : total >= 5 ? "alto" : "padrao";

  const abrirFila = () => {
    try {
      window.sessionStorage.setItem(FILTRO_NAO_ATRIBUIDAS_KEY, "1");
    } catch {
      /* sem armazenamento: o evento abaixo ainda funciona na mesma tela */
    }
    window.dispatchEvent(new CustomEvent(EVENTO_FILTRAR_NAO_ATRIBUIDAS));
    void navigate({ to: "/app/nina", hash: "atend-inbox" });
  };

  return (
    <button
      type="button"
      onClick={abrirFila}
      title="Ver apenas as conversas sem atendente"
      aria-label={`${total} conversas não atribuídas. Abrir fila.`}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-atd-on-strong",
        "shadow-sm will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-atd-danger/60",
        nivel === "padrao" && "bg-atd-danger animate-[fila-alerta_1.5s_ease-in-out_infinite]",
        nivel === "alto" && "bg-atd-danger animate-[fila-alerta-alto_1.2s_ease-in-out_infinite]",
        nivel === "critico" &&
          "bg-atd-danger-strong ring-2 ring-atd-danger/40 animate-[fila-alerta-critico_0.9s_ease-in-out_infinite]",
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">Não atribuídas</span>
      <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-md bg-atd-on-strong/25 px-1 text-[11px] font-extrabold tabular-nums">
        {total}
      </span>
    </button>
  );
}
