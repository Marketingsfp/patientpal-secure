/**
 * FASE 3 — roteamento dos eventos de tempo real do atendimento.
 *
 * Antes, qualquer mudança em `atend_conversas`, `whatsapp_mensagens`,
 * `atend_conversa_eventos` ou `atend_notas_internas` — de qualquer clínica e
 * de qualquer conversa — disparava recarga de lista E recarga do histórico da
 * conversa aberta. Uma mensagem no lead A recarregava o lead B.
 *
 * Aqui ficam apenas decisões puras: dado o conteúdo do evento e o contexto da
 * tela (clínica e conversa aberta), o que precisa ser atualizado.
 *
 * Importante: isto é desempenho, não segurança. O RLS e as validações do
 * backend continuam valendo — nenhuma consulta é dispensada por causa deste
 * filtro, e nada aqui concede acesso a dado nenhum.
 */

export type AlvoAtualizacao =
  /** Lista/inbox (cartões, ordenação, entrada e saída de escopo). */
  | "lista"
  /** Histórico da conversa aberta (mensagens e eventos de estado). */
  | "conversa"
  /** Painéis de apoio da conversa aberta (notas internas, resumo do handoff). */
  | "apoio"
  /** Contadores e tempo de espera. */
  | "espera";

export type EventoRealtime = {
  table: string;
  eventType?: "INSERT" | "UPDATE" | "DELETE" | string;
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
};

export type ContextoTela = {
  clinicaId: string | null;
  conversaAberta: string | null;
};

/** Linha útil do evento: DELETE só traz o registro antigo. */
export function linhaDoEvento(ev: EventoRealtime): Record<string, any> {
  return (ev.new && Object.keys(ev.new).length ? ev.new : ev.old) ?? {};
}

export function classificarEvento(ev: EventoRealtime, ctx: ContextoTela): AlvoAtualizacao[] {
  const linha = linhaDoEvento(ev);

  // Outra clínica: nada a fazer nesta tela. Quando o evento não traz a
  // clínica, o tratamento continua sendo o conservador (não descarta).
  if (linha.clinica_id && ctx.clinicaId && linha.clinica_id !== ctx.clinicaId) return [];
  // Console de homologação nunca mexe no atendimento real.
  if (linha.is_teste === true) return [];

  const aberta = ctx.conversaAberta;

  switch (ev.table) {
    case "whatsapp_mensagens": {
      const alvos: AlvoAtualizacao[] = ["lista", "espera"];
      if (aberta && linha.conversa_id === aberta) alvos.push("conversa");
      return alvos;
    }
    case "atend_conversas": {
      // Criação, transferência, troca de responsável, encerramento,
      // reabertura, saída de escopo e exclusão passam todas por aqui.
      const alvos: AlvoAtualizacao[] = ["lista", "espera"];
      if (aberta && linha.id === aberta) alvos.push("conversa");
      return alvos;
    }
    case "atend_conversa_eventos": {
      // Movimentações de estado da conversa aberta entram no histórico; das
      // demais, a própria linha de `atend_conversas` já atualiza a lista.
      if (aberta && linha.conversa_id === aberta) return ["conversa"];
      return [];
    }
    case "atend_notas_internas":
    case "atend_handoff_resumos": {
      if (aberta && linha.conversa_id === aberta) return ["apoio"];
      return [];
    }
    default:
      // Tabela desconhecida: comportamento conservador de antes.
      return ["lista"];
  }
}

/**
 * Agrupador com teto: junta eventos próximos numa execução só, mas nunca
 * adia além do teto. Em tráfego contínuo o temporizador não fica sendo
 * reiniciado para sempre — a atualização sai no máximo a cada `tetoMs`.
 */
export type Agrupador = {
  agendar: () => void;
  /** Executa agora o que estiver pendente (usado na reconexão). */
  descarregarAgora: () => void;
  cancelar: () => void;
  pendente: () => boolean;
};

export function criarAgrupador(opcoes: {
  executar: () => void;
  atrasoMs?: number;
  tetoMs?: number;
  agora?: () => number;
  agendarTimer?: (fn: () => void, ms: number) => any;
  cancelarTimer?: (id: any) => void;
}): Agrupador {
  const atraso = opcoes.atrasoMs ?? 400;
  const teto = opcoes.tetoMs ?? 1500;
  const agora = opcoes.agora ?? (() => Date.now());
  const agendarTimer = opcoes.agendarTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelarTimer = opcoes.cancelarTimer ?? ((id) => clearTimeout(id));

  let timer: any = null;
  let primeiroPedidoEm: number | null = null;

  const executar = () => {
    if (timer !== null) cancelarTimer(timer);
    timer = null;
    primeiroPedidoEm = null;
    opcoes.executar();
  };

  return {
    agendar() {
      const t = agora();
      if (primeiroPedidoEm === null) primeiroPedidoEm = t;
      const restanteAteTeto = Math.max(0, teto - (t - primeiroPedidoEm));
      const espera = Math.min(atraso, restanteAteTeto);
      if (timer !== null) cancelarTimer(timer);
      timer = agendarTimer(executar, espera);
    },
    descarregarAgora() {
      if (timer === null && primeiroPedidoEm === null) return;
      executar();
    },
    cancelar() {
      if (timer !== null) cancelarTimer(timer);
      timer = null;
      primeiroPedidoEm = null;
    },
    pendente() {
      return timer !== null;
    },
  };
}
