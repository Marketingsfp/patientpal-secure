import { useSyncExternalStore } from "react";
import { criarRelogioPausa } from "@/lib/atendimento/relogio-pausa";

const relogio = criarRelogioPausa({
  agora: () => Date.now(),
  iniciar(atualizar) {
    const intervalo = window.setInterval(atualizar, 1000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizar);
    };
  },
});
const instanteServidor = () => 0;

/** Sidebar e Central usam o mesmo relógio; avançar os segundos não consulta o servidor. */
export function useRelogioPausa() {
  return useSyncExternalStore(relogio.assinar, relogio.ler, instanteServidor);
}
