/**
 * Regra de 08/10/2026: quando a lista de uma especialidade tem mais de 8
 * profissionais para apresentar, a Nina não lista — encaminha para a equipe,
 * que apresenta as opções. Evita respostas longas em que o modelo omite nomes.
 * Aplica-se somente ao objetivo explícito de ver/escolher os profissionais.
 * Confirmar a existência do atendimento ou comparar a primeira vaga não
 * apresenta a lista. Pedido pelo nome do profissional também não entra.
 */
export const LIMITE_LISTA_PROFISSIONAIS = 8;
export const MOTIVO_LISTA_EXTENSA = "LISTA_PROFISSIONAIS_EXTENSA";

type Dados =
  | {
      doctors?: unknown;
      esclarecimento?: unknown;
      tipo_atendimento?: unknown;
    }
  | null
  | undefined;

export function listaProfissionaisExtensa(
  ferramenta: string,
  argumentos: string | null | undefined,
  dados: Dados,
): { total: number; especialidade: string } | null {
  if (ferramenta !== "consultar_cadastro" || !dados || dados.esclarecimento) return null;
  if (dados.tipo_atendimento === "exame_procedimento") return null;
  let args: { medico?: unknown; termo?: unknown; objetivos?: unknown } = {};
  try {
    args = JSON.parse(argumentos ?? "{}") ?? {};
  } catch {
    /* argumentos inválidos: sem regra */
  }
  // O modelo interpreta a mensagem inteira e o histórico na chamada existente.
  // Sem objetivo explícito de apresentação, a quantidade não prova esse pedido.
  if (!Array.isArray(args.objetivos) || !args.objetivos.includes("medicos")) return null;
  if (typeof args.medico === "string" && args.medico.trim()) return null;
  const medicos = Array.isArray(dados.doctors)
    ? dados.doctors.filter((m) => typeof m === "string" && m.trim())
    : [];
  if (medicos.length <= LIMITE_LISTA_PROFISSIONAIS) return null;
  return {
    total: medicos.length,
    especialidade: typeof args.termo === "string" ? args.termo.trim() : "",
  };
}

export function motivoListaExtensa(a: { total: number; especialidade: string }): string {
  return `${MOTIVO_LISTA_EXTENSA}: ${a.total} profissionais${a.especialidade ? ` em "${a.especialidade.slice(0, 80)}"` : ""}.`;
}
