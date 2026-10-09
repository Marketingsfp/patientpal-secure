/**
 * Regra de 08/10/2026: quando a lista de uma especialidade tem mais de 8
 * profissionais para apresentar, a Nina não lista — encaminha para a equipe,
 * que apresenta as opções. Evita respostas longas em que o modelo omite nomes.
 * Pedido pelo nome do profissional não entra na regra.
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
  let args: { medico?: unknown; termo?: unknown } = {};
  try {
    args = JSON.parse(argumentos ?? "{}") ?? {};
  } catch {
    /* argumentos inválidos: sem regra */
  }
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
