/**
 * Jev — Fase 6: confere a resposta da Maria ANTES do envio. O Jev só lê o
 * texto; o código cruza com os fatos do turno (agenda consultada, gravação
 * confirmada, dados devolvidos pelas ferramentas). Puro (sem rede).
 * Flag `nina_jev_fase6`. Erro/demora = resposta segue como hoje.
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const LIMITE_CONFERENCIA = 0.7;
const LIMITE_DADOS = 12_000;

export type FatosTurno = {
  /** Agenda consultada com opções neste turno ou opções já oferecidas na sessão. */
  agendaConsultada: boolean;
  /** Gravação confirmada pelo sistema (neste turno ou já existente). */
  agendamentoConfirmado: boolean;
  /** Resultados das ferramentas deste turno (texto). Vazio = não confere dados. */
  dadosConsultados: string[];
};

export type ProblemaConferencia = "vaga_sem_agenda" | "agendado_sem_confirmacao" | "cancelamento" | "dado_sem_fonte";

export function estadoConferencia(resposta: string, fatos: FatosTurno) {
  const dados = fatos.dadosConsultados.join("\n").slice(0, LIMITE_DADOS);
  return { resposta, dados_consultados: dados || null };
}

export function perguntasConferencia(fatos: FatosTurno): Record<string, PerguntaJev> {
  const p: Record<string, PerguntaJev> = {
    afirma_vaga: {
      type: "noul",
      instructions:
        "`resposta` afirma que existe vaga, horário livre ou data disponível específica para o paciente marcar? Perguntar a preferência de dia ou período, ou dizer que vai verificar, não é afirmar vaga.",
    },
    afirma_agendado: {
      type: "noul",
      instructions:
        "`resposta` afirma que um agendamento já foi feito, marcado, reservado ou confirmado? Resumir dados para o paciente confirmar ou perguntar se pode agendar não é afirmar.",
    },
    cancelamento: {
      type: "noul",
      instructions:
        "`resposta` diz que a própria atendente cancelou, vai cancelar ou desmarcou uma consulta? Dizer que vai encaminhar o pedido de cancelamento para a recepção não conta.",
    },
  };
  if (fatos.dadosConsultados.length > 0)
    p.dado_sem_fonte = {
      type: "noul",
      instructions:
        "`resposta` cita algum valor em dinheiro, endereço ou telefone que NÃO aparece em `dados_consultados`? Responda sim apenas se houver valor, endereço ou telefone na resposta ausente dos dados.",
    };
  return p;
}



/** Problemas encontrados. Resposta ausente nunca vira problema (não bloqueia o envio). */
export function problemasConferencia(respostas: Record<string, RespostaJev>, fatos: FatosTurno, limite: number = LIMITE_CONFERENCIA): ProblemaConferencia[] {
  const sim = (r: RespostaJev | undefined) => typeof r?.noul === "number" && r.noul >= limite;
  const out: ProblemaConferencia[] = [];
  if (sim(respostas["afirma_vaga"]) && !fatos.agendaConsultada) out.push("vaga_sem_agenda");
  if (sim(respostas["afirma_agendado"]) && !fatos.agendamentoConfirmado) out.push("agendado_sem_confirmacao");
  if (sim(respostas["cancelamento"])) out.push("cancelamento");
  if (fatos.dadosConsultados.length > 0 && sim(respostas["dado_sem_fonte"])) out.push("dado_sem_fonte");
  return out;
}

const CORRECOES: Record<ProblemaConferencia, string> = {
  vaga_sem_agenda: "A resposta afirma vaga ou horário disponível sem consulta à agenda neste atendimento. Não afirme disponibilidade sem consultar a agenda.",
  agendado_sem_confirmacao: "A resposta afirma agendamento feito, mas não há gravação confirmada pelo sistema. Não diga que está agendado.",
  cancelamento: "A Maria nunca cancela consultas. Pedidos de cancelamento são sempre encaminhados para a recepção.",
  dado_sem_fonte: "A resposta cita valor, endereço ou telefone que não aparece nos dados consultados. Use só dados consultados; se não houver, não informe.",
};

/** Instrução interna (papel de sistema) para a Maria refazer a resposta uma vez. */
export function instrucaoCorrecao(problemas: ProblemaConferencia[]): string {
  return `Conferência antes do envio encontrou problema(s): ${problemas.map((p) => CORRECOES[p]).join(" ")} Reescreva a resposta corrigindo só isso, preservando o restante que estiver correto. Esta correção não autoriza agendar, cancelar nem consultar nada novo.`;
}

export const RESPOSTA_SEGURA_CONFERENCIA =
  "Desculpe, preciso conferir essa informação antes de te responder. Pode me dizer novamente como posso ajudar?";
