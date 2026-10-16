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
  "atend_leitura_operacional",
  "agendamentos",
] as const;

export function useRealtimeAtendimento(params: {
  clinicaId: string | null;
  conversaAberta: string | null;
  pacienteAberto?: string | null;
  agendamentosAbertos?: readonly string[];
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
  /** Modo treinamento: admin com "Mostrar conversas de teste" ligado. */
  incluirTeste?: boolean;
}) {
  const { clinicaId, conversaAberta, onAlvos, onReconectar, onEstado, enabled = true } = params;
  const incluirTesteRef = useRef(params.incluirTeste);
  incluirTesteRef.current = params.incluirTeste;

  // As referências mais recentes ficam em refs: trocar de conversa não pode
  // derrubar e recriar o canal (isso reiniciava a conexão a cada lead).
  const abertaRef = useRef(conversaAberta);
  abertaRef.current = conversaAberta;
  const pacienteRef = useRef(params.pacienteAberto);
  pacienteRef.current = params.pacienteAberto;
  const agendamentosRef = useRef(params.agendamentosAbertos);
  agendamentosRef.current = params.agendamentosAbertos;
  const onAlvosRef = useRef(onAlvos);
  onAlvosRef.current = onAlvos;
  const onReconectarRef = useRef(onReconectar);
  onReconectarRef.current = onReconectar;
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;
  const canalId = useId();
  // Classifica o evento com a tela atual e avisa só quem precisa ser atualizado.
  const despacharRef = useRef((tabela: string, clinica: string, payload: any) => {
    const ev: EventoRealtime = {
      table: tabela,
      eventType: payload?.eventType,
      new: payload?.new ?? null,
      old: payload?.old ?? null,
    };
    const alvos = classificarEvento(ev, {
      clinicaId: clinica,
      conversaAberta: abertaRef.current,
      pacienteAberto: pacienteRef.current,
      agendamentosAbertos: agendamentosRef.current,
      incluirTeste: incluirTesteRef.current,
    });
    if (alvos.length === 0) return;
    onAlvosRef.current(alvos, ev);
  });

  useEffect(() => {
    if (!enabled || !clinicaId) return;
    // Uma assinatura por clínica + montagem da tela. A conversa aberta não
    // entra na chave: trocar de lead não recria o canal.
    const maquina = criarMaquinaConexao();
    onEstadoRef.current?.(maquina.estado());
    const ch = supabase.channel(chaveCanalAtendimento(clinicaId, canalId));
    for (const tabela of TABELAS_ATENDIMENTO) {
      // Agendamentos têm canal próprio, só do paciente aberto (abaixo).
      if (tabela === "agendamentos") continue;
      ch.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: tabela,
          filter: `clinica_id=eq.${clinicaId}`,
        },
        (payload: any) => despacharRef.current(tabela, clinicaId, payload),
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

  // Desempenho (16/10/2026): os agendamentos da clínica inteira chegavam a
  // cada tela do OS ZAP (a recepção mexe na agenda o dia todo) e só eram
  // descartados no navegador. Agora o canal escuta só o paciente aberto.
  // Exclusão não aceita filtro no tempo real: vai pela clínica (é rara).
  const pacienteAberto = params.pacienteAberto ?? null;
  useEffect(() => {
    if (!enabled || !clinicaId || !pacienteAberto) return;
    const ch = supabase
      .channel(`agenda-paciente:${clinicaId}:${pacienteAberto}:${canalId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "agendamentos",
          filter: `paciente_id=eq.${pacienteAberto}`,
        },
        (payload: any) => despacharRef.current("agendamentos", clinicaId, payload),
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "agendamentos",
          filter: `paciente_id=eq.${pacienteAberto}`,
        },
        (payload: any) => despacharRef.current("agendamentos", clinicaId, payload),
      )
      .on(
        "postgres_changes" as any,
        {
          event: "DELETE",
          schema: "public",
          table: "agendamentos",
          filter: `clinica_id=eq.${clinicaId}`,
        },
        (payload: any) => despacharRef.current("agendamentos", clinicaId, payload),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, clinicaId, pacienteAberto, canalId]);
}
