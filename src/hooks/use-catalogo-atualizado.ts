import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EVENTO_REFS_INVALIDADAS, invalidateAgendaRefs } from "@/lib/agenda/refs-cache";

/**
 * Mantém o catálogo (especialidades, serviços e médicos) atualizado entre
 * COMPUTADORES diferentes.
 *
 * O problema que este hook resolve: quando o administrador altera a
 * especialidade de um serviço ou de um médico, `invalidateAgendaRefs` avisa
 * apenas a própria aba e as outras abas do MESMO navegador
 * (`BroadcastChannel`). A recepcionista, em outra máquina, continuava com a
 * lista antiga — o cache in-memory da Agenda e o React Query (que está
 * configurado com `refetchOnMount: false` e `refetchOnWindowFocus: false`)
 * não tinham nenhum gatilho para reler.
 *
 * A revalidação acontece quando a janela do sistema volta ao foco, que é
 * exatamente o momento em que a recepcionista retoma o atendimento. Há um
 * intervalo mínimo entre duas revalidações para não disparar consultas a cada
 * alt-tab.
 */

/** Segunda parte da chave das queries de catálogo da Agenda V2. */
const CHAVES_AGENDA_V2 = new Set([
  "medicos",
  "especialidades",
  "proc-meta",
  "wizard-especialidades",
]);

function ehQueryDeCatalogo(chave: readonly unknown[]): boolean {
  // Tela de Cadastros › Especialidades.
  if (chave[0] === "especialidades") return true;
  if (chave[0] !== "agenda-v2") return false;
  return typeof chave[1] === "string" && CHAVES_AGENDA_V2.has(chave[1]);
}

/** Intervalo mínimo entre duas revalidações disparadas pelo foco. */
const INTERVALO_MINIMO_MS = 15_000;

export function useCatalogoAtualizado(clinicaId?: string | null): void {
  const queryClient = useQueryClient();
  const ultimaRevalidacaoRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Marca como obsoletas (e refaz, se estiverem na tela) as queries de
    // catálogo. Não toca nos agendamentos do dia, que já têm realtime próprio.
    const revalidarQueries = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => ehQueryDeCatalogo(query.queryKey),
      });
    };

    const aoVoltarAoFoco = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const agora = Date.now();
      if (agora - ultimaRevalidacaoRef.current < INTERVALO_MINIMO_MS) return;
      ultimaRevalidacaoRef.current = agora;
      // Limpa o cache in-memory da Agenda clássica e emite
      // EVENTO_REFS_INVALIDADAS, que faz a Agenda reler as listas na hora.
      invalidateAgendaRefs(clinicaId ?? undefined);
      revalidarQueries();
    };

    // Alteração feita em outra aba do mesmo navegador chega por este evento;
    // aqui ele passa a alcançar também as telas que usam React Query.
    window.addEventListener(EVENTO_REFS_INVALIDADAS, revalidarQueries);
    window.addEventListener("focus", aoVoltarAoFoco);
    document.addEventListener("visibilitychange", aoVoltarAoFoco);
    return () => {
      window.removeEventListener(EVENTO_REFS_INVALIDADAS, revalidarQueries);
      window.removeEventListener("focus", aoVoltarAoFoco);
      document.removeEventListener("visibilitychange", aoVoltarAoFoco);
    };
  }, [queryClient, clinicaId]);
}
