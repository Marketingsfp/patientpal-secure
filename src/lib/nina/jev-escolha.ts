/**
 * Jev Fase 7 — entender o "sim" e a escolha de horário (regras puras, sem rede).
 *
 * Só entra quando a Maria acabou de propor um resumo (aguardando aceite) ou uma
 * lista de horários, e a leitura por regras NÃO entendeu a mensagem. O Jev só
 * escolhe entre as opções realmente oferecidas (ou "nenhuma"); nunca inventa
 * horário. Abaixo de 80% de certeza nada é aplicado e o fluxo atual segue.
 * A gravação continua dependendo da confirmação do sistema.
 */
import type { PerguntaJev, RespostaJev } from "./jev";
import type { VagaAgendamento } from "./agendamento-escolha";

export const CERTEZA_MINIMA_ESCOLHA = 0.8;
export const MAX_OPCOES_JEV = 12;

export type SituacaoEscolha =
  | { tipo: "resumo"; vaga: VagaAgendamento; resumo: string }
  | { tipo: "opcoes"; opcoes: VagaAgendamento[] };

export type DecisaoEscolha =
  | { tipo: "aceitou" }
  | { tipo: "escolheu"; vaga: VagaAgendamento }
  | { tipo: "nada" };

const rotulo = (v: VagaAgendamento) =>
  `${v.data} às ${v.hora} com ${v.medico}${v.procedimento ? ` (${v.procedimento})` : ""}`;

export function estadoEscolha(mensagem: string, ultimaMaria: string | null, s: SituacaoEscolha) {
  return {
    ultima_mensagem_da_maria: (ultimaMaria ?? "").slice(0, 1500),
    resposta_do_paciente: mensagem.slice(0, 600),
    ...(s.tipo === "resumo"
      ? { resumo_proposto: s.resumo.slice(0, 800) }
      : {
          opcoes_oferecidas: s.opcoes
            .slice(0, MAX_OPCOES_JEV)
            .map((v, i) => `opcao_${i + 1}: ${rotulo(v)}`),
        }),
  };
}

export function perguntasEscolha(s: SituacaoEscolha): Record<string, PerguntaJev> {
  if (s.tipo === "resumo") {
    return {
      aceite: {
        type: "choice",
        instructions:
          "A Maria propôs o agendamento em `resumo_proposto` e pediu confirmação. Avalie o aceite desse resumo separadamente das perguntas adicionais da mensagem. Confirmar a reserva e perguntar sobre outro exame são intenções compatíveis. Uma pergunta adicional não revoga um aceite explícito; condições ou mudanças da reserva não são aceite.",
        criteria: {
          aceitou:
            "Aceitou o agendamento exatamente como proposto, sem pedir mudança nem impor condição, inclusive quando também pergunta sobre outro exame. Exemplo: 'isso ai pode marca. ah e da pra fazer hemograma e TSH no mesmo dia?'.",
          recusou: "Recusou, desistiu ou disse que não quer esse agendamento.",
          pediu_outra_coisa:
            "Pediu mudança da reserva (outro dia, horário, período, profissional ou paciente), aceitou com condição ou mudou de assunto sem confirmar o resumo. Pergunta adicional acompanhada de aceite explícito não pertence a esta categoria.",
          nao_claro: "Não dá para saber se aceitou ou não.",
        },
      },
    };
  }
  const opcoes = s.opcoes.slice(0, MAX_OPCOES_JEV);
  const criteria: Record<string, string> = {};
  opcoes.forEach((v, i) => {
    criteria[`opcao_${i + 1}`] = `O paciente escolheu: ${rotulo(v)}.`;
  });
  criteria.nenhuma =
    "O paciente não escolheu nenhuma das opções listadas: pediu outro horário, recusou, fez pergunta ou a escolha é ambígua.";
  return {
    horario: {
      type: "choice",
      instructions:
        'A Maria ofereceu os horários em `opcoes_oferecidas`. Qual deles o paciente escolheu em `resposta_do_paciente`? Considere referências como "a segunda", "a das 10" ou "a mais cedo".',
      criteria,
    },
  };
}

/** Só aplica com certeza mínima; qualquer outra coisa = fluxo atual. */
export function decisaoEscolha(
  respostas: Record<string, RespostaJev>,
  s: SituacaoEscolha,
  certeza: number = CERTEZA_MINIMA_ESCOLHA,
): DecisaoEscolha {
  if (s.tipo === "resumo") {
    const r = respostas.aceite;
    const p = r?.choice ? (r.probabilities?.[r.choice] ?? r.confidence) : undefined;
    return r?.choice === "aceitou" && typeof p === "number" && p >= certeza
      ? { tipo: "aceitou" }
      : { tipo: "nada" };
  }
  const r = respostas.horario;
  const m = /^opcao_(\d+)$/.exec(r?.choice ?? "");
  const p = r?.choice ? (r.probabilities?.[r.choice] ?? r.confidence) : undefined;
  if (!m || typeof p !== "number" || p < certeza) return { tipo: "nada" };
  const vaga = s.opcoes.slice(0, MAX_OPCOES_JEV)[Number(m[1]) - 1];
  return vaga ? { tipo: "escolheu", vaga } : { tipo: "nada" };
}
