import type { ResultadoBroker } from "./tool-broker";

const MOTIVOS_SEM_VAGAS = new Set(["NO_AVAILABILITY", "AGENDA_CHEIA", "NAO_ATENDE_NO_DIA"]);

/** Só uma consulta concluída da agenda pode comprovar ausência de vagas. */
export function encaminhamentoSemVagas(resultado: ResultadoBroker, argumentos: unknown) {
  if (!resultado.success || resultado.erro || resultado.capacidade !== "checkAvailability")
    return null;
  const dados = resultado.dados as Record<string, unknown> | null;
  if (!dados || dados.ok !== true || dados.consulta_realizada === false) return null;
  const motivo = String(dados.reason ?? dados.motivo ?? "");
  if (!MOTIVOS_SEM_VAGAS.has(motivo) || dados.disponivel === true || dados.proxima) return null;
  // Um horário ocupado com alternativas não significa que a agenda ficou sem vagas.
  if (
    ["slots", "horarios", "proximos", "alternativas", "seguintes"].some(
      (chave) => Array.isArray(dados[chave]) && (dados[chave] as unknown[]).length > 0,
    )
  )
    return null;

  let args: Record<string, unknown> = {};
  try {
    const valor: unknown = typeof argumentos === "string" ? JSON.parse(argumentos) : argumentos;
    if (valor && typeof valor === "object" && !Array.isArray(valor))
      args = valor as Record<string, unknown>;
  } catch {
    /* O resultado da consulta continua sendo a evidência. */
  }
  const criterios = Object.fromEntries(
    ["medico_id", "especialidade", "data", "hora", "periodo", "dia_semana", "a_partir_de"]
      .filter((chave) => args[chave] != null)
      .map((chave) => [chave, String(args[chave]).slice(0, 160)]),
  );
  return {
    motivo: "AGENDA_SEM_VAGAS: consulta concluída sem vagas ou alternativas disponíveis",
    resumo: `O paciente solicitou disponibilidade. A ferramenta ${resultado.ferramenta} retornou ${motivo}, sem vagas nem alternativas. Critérios consultados: ${JSON.stringify(criterios)}. A equipe precisa continuar a busca de agendamento; nenhuma reserva foi feita por esta consulta.`,
    urgencia: "normal" as const,
    setor: "Agendamento",
  };
}

export function respostaSemVagas(handoffConfirmado: boolean): string {
  return handoffConfirmado
    ? "Não encontrei vagas disponíveis para o atendimento solicitado. Encaminhei sua conversa para nossa equipe, que vai continuar o atendimento por aqui."
    : "Não encontrei vagas disponíveis para o atendimento solicitado e não consegui transferir sua conversa neste momento. Por favor, entre em contato com a recepção para continuar o atendimento.";
}
