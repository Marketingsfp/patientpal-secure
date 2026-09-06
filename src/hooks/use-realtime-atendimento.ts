import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  classificarEvento,
  type AlvoAtualizacao,
  type EventoRealtime,
} from "@/lib/atendimento/realtime-roteador";

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
  /** Chamado quando o canal (re)conecta: hora de reconciliar o que faltou. */
  onReconectar?: () => void;
  enabled?: boolean;
}) {
  const { clinicaId, conversaAberta, onAlvos, onReconectar, enabled = true } = params;

  // As referências mais recentes ficam em refs: trocar de conversa não pode
  // derrubar e recriar o canal (isso reiniciava a conexão a cada lead).
  const abertaRef = useRef(conversaAberta);
  abertaRef.current = conversaAberta;
  const onAlvosRef = useRef(onAlvos);
  onAlvosRef.current = onAlvos;
  const onReconectarRef = useRef(onReconectar);
  onReconectarRef.current = onReconectar;
  const jaConectou = useRef(false);
  const canalId = useId();

  useEffect(() => {
    if (!enabled || !clinicaId) return;
    jaConectou.current = false;
    const ch = supabase.channel(`atend:${clinicaId}:${canalId}`);
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
      if (status !== "SUBSCRIBED") return;
      // Primeira conexão não é reconexão: a tela já carregou tudo agora.
      if (!jaConectou.current) {
        jaConectou.current = true;
        return;
      }
      onReconectarRef.current?.();
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, clinicaId, canalId]);
}
