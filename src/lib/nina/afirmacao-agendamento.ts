/** Reconhece compromisso operacional; modalidade publicada continua sendo fato do catálogo. */
import { segmentosDaResposta } from "./confidence/afirmacao";
import { classificarNatureza, oracoesDaResposta } from "./confidence/modalidade";
import { classificarAfirmacaoOperacional } from "./confidence/workflow";

export type AfirmacaoAgendamento = {
  tipo: "nenhuma" | "sucesso_agendamento" | "promessa_agendamento";
  trecho: string | null;
};

const PRIMEIRA_PESSOA = /\b(?:agendei|marquei|reservei|agendamos|marcamos|reservamos)\b/iu;
const PROMESSA =
  /\b(?:estou|vou|irei|estamos|vamos|iremos)\s+(?:agendando|marcando|reservando|agendar|marcar|reservar)\b/iu;
const RESULTADO_PACIENTE =
  /\b(?:seu|sua)\s+(?:consulta|atendimento|agendamento|hor[aá]rio|exame|procedimento)\b[^.!?;\n]{0,100}\b(?:agendad[oa]|marcad[oa]|reservad[oa]|confirmad[oa])\b/iu;
const RESULTADO_COM_VERBO =
  /\b(?:consulta|agendamento|hor[aá]rio|exame|procedimento)\s+(?:foi|est[aá]|ficou|se encontra)\s+(?:agendad[oa]|marcad[oa]|reservad[oa]|confirmad[oa]|conclu[ií]d[oa]|realizad[oa])\b/iu;
const RESULTADO_EXPLICITO =
  /\b(?:agendamento\s+(?:realizado|conclu[ií]do|confirmado)|consulta\s+confirmada|hor[aá]rio\s+(?:reservado|confirmado)|confirmad[oa]\s+(?:seu|sua)\s+(?:consulta|agendamento|hor[aá]rio))\b/iu;
const RESULTADO_ELIPTICO =
  /^(?:(?:consulta|agendamento|hor[aá]rio|exame|procedimento)\s+)?(?:(?:j[aá]\s+)?(?:est[aá]|ficou|foi)\s+)?(?:agendad[oa]|marcad[oa]|reservad[oa]|confirmad[oa])\s+para\s+[^.!?;\n]{0,90}(?:\b(?:hoje|amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[aá]bado|domingo)\b|\b\d{1,2}[/-]\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*(?:h(?:\d{2})?\b|:\d{2}\b))/iu;

/**
 * Não basta a palavra "agendado": ela também descreve atendimento por
 * agendamento. Precisamos de um ato, promessa ou resultado da reserva.
 * Essa distinção não valida horários, modalidades nem qualquer outro fato;
 * esses dados continuam sujeitos ao motor de confiança e à fonte publicada.
 */
export function detectarAfirmacaoAgendamento(texto?: string | null): AfirmacaoAgendamento {
  for (const segmento of segmentosDaResposta((texto ?? "").replace(/[*_]/g, ""))) {
    const frase = segmento.texto.trim();
    // Oferta/pergunta não é operação. Conservar o sinal de interrogação que
    // a segmentação remove evita transformar "vou agendar?" em promessa.
    const fim = segmento.inicio + segmento.texto.length;
    const original = (texto ?? "").replace(/[*_]/g, "");
    if (original[fim] === "?") continue;
    for (const oracao of oracoesDaResposta(frase)) {
      const trecho = oracao.texto.trim();
      if (classificarNatureza(trecho) !== "afirmacao_positiva") continue;
      const operacional = classificarAfirmacaoOperacional(trecho);
      if (operacional === "falha_agendamento") continue;
      if (PROMESSA.test(trecho) || operacional === "promessa_agendamento")
        return { tipo: "promessa_agendamento", trecho };
      if (
        PRIMEIRA_PESSOA.test(trecho) ||
        RESULTADO_PACIENTE.test(trecho) ||
        RESULTADO_COM_VERBO.test(trecho) ||
        RESULTADO_EXPLICITO.test(trecho) ||
        RESULTADO_ELIPTICO.test(trecho)
      )
        return { tipo: "sucesso_agendamento", trecho };
    }
  }
  return { tipo: "nenhuma", trecho: null };
}

export function afirmaOuPrometeAgendamento(texto?: string | null): boolean {
  return detectarAfirmacaoAgendamento(texto).tipo !== "nenhuma";
}
