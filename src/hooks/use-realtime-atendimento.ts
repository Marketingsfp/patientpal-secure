import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  classificarEvento,
  type AlvoAtualizacao,
  type EventoRealtime,
} from "@/lib/atendimento/realtime-roteador";
import {
  chaveCanalAtendimento,
  criarMaquinaConexao,
  type EstadoConexao,
} from "@/lib/atendimento/realtime-conexao";

/**
 * FASE 3 — tempo real específico do atendimento.
 *
 * O hook compartilhado `use-realtime-refresh` continua igual para os demais
 * módulos (painel, caixa, check-in, fila...). Aqui o atendimento assina as
 * tabelas já filtradas pela clínica e olha o conteúdo do evento para avisar
 * só quem precisa ser atualizado: lista, conversa aberta, apoio ou espera.
 *
 * Segurança não muda: o filtro é do canal de tempo real; toda leitura de dado
 * continua passando pelas funções autenticadas e pelo RLS.
 */
export const TABELAS_ATENDIMENTO = [
  "atend_conversas",
  "whatsapp_mensagens",
  "atend_conversa_eventos",
  "atend_notas_internas",
  "atend_handoff_resumos",
] as const;

export function useRealtimeAtendimento(params: {
  clinicaId: string | null;
  conversaAberta: string | null;
  onAlvos: (alvos: AlvoAtualizacao[], evento: EventoRealtime) => void;
  /**
   * Chamado quando o canal é confirmado — inclusive na PRIMEIRA vez. A lista
   * inicial e a assinatura não são simultâneas: o que mudou nessa janela (uma
   * transferência, por exemplo) só aparece se a tela conferir de novo aqui.
   */
  onReconectar?: () => void;
  /** Estado da conexão (para telemetria/diagnóstico; sem tela nesta fase). */
  onEstado?: (estado: EstadoConexao) => void;
  enabled?: boolean;
}) {
  const { clinicaId, conversaAberta, onAlvos, onReconectar, onEstado, enabled = true } = params;

  // As referências mais recentes ficam em refs: trocar de conversa não pode
  // derrubar e recriar o canal (isso reiniciava a conexão a cada lead).
  const abertaRef = useRef(conversaAberta);
  abertaRef.current = conversaAberta;
  const onAlvosRef = useRef(onAlvos);
  onAlvosRef.current = onAlvos;
  const onReconectarRef = useRef(onReconectar);
  onReconectarRef.current = onReconectar;
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;
  const canalId = useId();

  useEffect(() => {
    if (!enabled || !clinicaId) return;
    // Uma assinatura por clínica + montagem da tela. A conversa aberta não
    // entra na chave: trocar de lead não recria o canal.
    const maquina = criarMaquinaConexao();
    onEstadoRef.current?.(maquina.estado());
    const ch = supabase.channel(chaveCanalAtendimento(clinicaId, canalId));
    for (const tabela of TABELAS_ATENDIMENTO) {
      ch.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: tabela,
          filter: `clinica_id=eq.${clinicaId}`,
        },
        (payload: any) => {
          const ev: EventoRealtime = {
            table: tabela,
            eventType: payload?.eventType,
            new: payload?.new ?? null,
            old: payload?.old ?? null,
          };
          const alvos = classificarEvento(ev, {
            clinicaId,
            conversaAberta: abertaRef.current,
          });
          if (alvos.length === 0) return;
          onAlvosRef.current(alvos, ev);
        },
      );
    }
    ch.subscribe((status: string) => {
      const acao = maquina.aplicar(status);
      onEstadoRef.current?.(acao.estado);
      // Falha, tempo esgotado ou fechamento não são ignorados: o canal fica
      // marcado como degradado e, quando voltar, a tela confere tudo de novo.
      if (!acao.reconciliar) return;
      // Vale também para a PRIMEIRA confirmação: o que mudou entre o carregamento
      // da lista e a assinatura (uma transferência, por exemplo) aparece aqui.
      onReconectarRef.current?.();
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, clinicaId, canalId]);
}
