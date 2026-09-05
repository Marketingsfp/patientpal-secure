/**
 * DESFECHO DA CONVERSA E VIGÊNCIA DO RESUMO DA NINA (regras puras).
 *
 * O resumo interno é um artefato com versão e situação:
 *   - `active`      → resumo vigente, é o que o card do chat mostra;
 *   - `superseded`  → substituído por um resumo mais novo (fica na auditoria);
 *   - `archived`    → conversa reaberta: o resumo do ciclo anterior não vale
 *                     mais como situação atual, mas continua no histórico.
 *
 * Sempre que a conversa tem um desfecho relevante (agendamento concluído ou
 * falho, transferência, resolução, timeout, cancelamento, remarcação), um novo
 * resumo é gerado e passa a ser o vigente. Nada é apagado.
 */
import type { ResumoHandoff } from "./handoff-resumo";

export type SituacaoResumo = "active" | "superseded" | "archived";

export type DesfechoConversa =
  | "agendamento_concluido"
  | "agendamento_falhou"
  | "handoff_humano"
  | "conversa_resolvida"
  | "timeout_sem_resposta"
  | "cancelamento"
  | "remarcacao"
  | "reabertura"
  | "outro";

export const ROTULO_DESFECHO: Record<DesfechoConversa, string> = {
  agendamento_concluido: "Agendamento concluído",
  agendamento_falhou: "Agendamento não concluído",
  handoff_humano: "Transferida para atendimento humano",
  conversa_resolvida: "Atendimento resolvido",
  timeout_sem_resposta: "Paciente sem resposta",
  cancelamento: "Cancelamento",
  remarcacao: "Remarcação",
  reabertura: "Conversa reaberta",
  outro: "Atualização do atendimento",
};

/** Desfechos que obrigam a gerar um resumo novo e superar o anterior. */
export const DESFECHOS_COM_NOVO_RESUMO: DesfechoConversa[] = [
  "agendamento_concluido",
  "agendamento_falhou",
  "handoff_humano",
  "conversa_resolvida",
  "timeout_sem_resposta",
  "cancelamento",
  "remarcacao",
];

export function exigeNovoResumo(d: DesfechoConversa): boolean {
  return DESFECHOS_COM_NOVO_RESUMO.includes(d);
}

/** Frase de situação coerente com o desfecho (nunca inventa dado clínico). */
export function situacaoPorDesfecho(d: DesfechoConversa): string | null {
  switch (d) {
    case "agendamento_concluido":
      return "Agendamento realizado com sucesso.";
    case "agendamento_falhou":
      return "A tentativa de agendamento não foi concluída.";
    case "conversa_resolvida":
      return "Atendimento encerrado pela equipe.";
    case "timeout_sem_resposta":
      return "O paciente ficou sem responder e o atendimento foi transferido.";
    case "cancelamento":
      return "Agendamento cancelado.";
    case "remarcacao":
      return "Agendamento remarcado.";
    default:
      return null;
  }
}

const PENDENCIA_SUPERADA =
  /(confirmar|confirma[çc][ãa]o|aguardando|agendar|marcar|escolher hor[áa]rio|retornar com hor[áa]rio|finalizar o agendamento)/i;

/**
 * Ajusta o resumo recém-gerado para refletir o estado FINAL: quando o
 * agendamento foi concluído, pendências e próxima ação que ainda pediam
 * confirmação/agendamento deixam de valer.
 */
export function ajustarResumoPorDesfecho(
  r: ResumoHandoff,
  d: DesfechoConversa,
): ResumoHandoff {
  const situacao = situacaoPorDesfecho(d) ?? r.situacao;
  if (d !== "agendamento_concluido" && d !== "conversa_resolvida" && d !== "remarcacao") {
    return { ...r, situacao };
  }
  const pendencias = r.pendencias.filter((p) => !PENDENCIA_SUPERADA.test(p));
  const proxima =
    r.proxima_acao && PENDENCIA_SUPERADA.test(r.proxima_acao) ? null : r.proxima_acao;
  return {
    ...r,
    situacao,
    pendencias,
    proxima_acao: proxima,
    // Etapa interrompida é conceito de atendimento em andamento.
    etapa_interrompida: null,
    ultima_pergunta: null,
  };
}

/** Rótulo curto do desfecho para o cabeçalho do card. */
export function rotuloDesfecho(d: string | null | undefined): string | null {
  if (!d) return null;
  return ROTULO_DESFECHO[d as DesfechoConversa] ?? null;
}

/** Um resumo só é exibido como vigente quando está `active`. */
export function resumoVigente(situacao: string | null | undefined): boolean {
  return (situacao ?? "active") === "active";
}
