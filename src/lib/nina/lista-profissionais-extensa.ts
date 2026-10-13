/**
 * Regra de 08/10/2026: quando a lista de uma especialidade tem mais de 8
 * profissionais para apresentar, a Nina não lista — encaminha para a equipe,
 * que apresenta as opções. Evita respostas longas em que o modelo omite nomes.
 * Aplica-se somente ao objetivo explícito de ver/escolher os profissionais.
 * Confirmar a existência do atendimento ou comparar a primeira vaga não
 * apresenta a lista. Pedido pelo nome do profissional também não entra.
 */
import { normalizarBuscaCatalogo } from "./catalogo-sem-registro";

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

/* ------------------------------------------------------------------ */
/* Janela de horário pedida pelo paciente (regra de 12/10/2026)        */
/* ------------------------------------------------------------------ */

export type JanelaHorario = { aPartir?: string; ate?: string; descricao: string };

const hhmm = (h: string, m?: string) => `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;

/**
 * "só consigo depois das 17h", "a partir das 18:30", "antes das 10h",
 * "de manhã", "à tarde", "à noite". Sem restrição explícita: null.
 */
export function janelaHorarioPedida(mensagem: string): JanelaHorario | null {
  const t = normalizarBuscaCatalogo(mensagem ?? "");
  const hora = /([01]?\d|2[0-3])(?:\s*(?::|h)\s*([0-5]\d))?\s*(?:h|hs|horas?)?/.source;
  const depois = new RegExp(
    String.raw`\b(?:depois|apos|a partir)\s+(?:d[ae]s?|as|a)?\s*` + hora + String.raw`\b`,
  ).exec(t);
  const antes = new RegExp(
    String.raw`\b(?:antes|ate)\s+(?:d[ae]s?|as|a)?\s*` + hora + String.raw`\b`,
  ).exec(t);
  if (depois || antes) {
    const janela: JanelaHorario = { descricao: "" };
    if (depois) janela.aPartir = hhmm(depois[1]!, depois[2]);
    if (antes) janela.ate = hhmm(antes[1]!, antes[2]);
    janela.descricao = [
      janela.aPartir ? `a partir das ${janela.aPartir}` : "",
      janela.ate ? `até as ${janela.ate}` : "",
    ]
      .filter(Boolean)
      .join(" e ");
    return janela;
  }
  if (/\b(?:de|pela|na|a)\s+manha\b/.test(t)) return { ate: "12:00", descricao: "pela manhã" };
  if (/\b(?:de|pela|na|a)\s+tarde\b/.test(t))
    return { aPartir: "12:00", ate: "18:00", descricao: "à tarde" };
  if (/\b(?:de|pela|na|a)\s+noite\b/.test(t)) return { aPartir: "18:00", descricao: "à noite" };
  return null;
}

type RegistroLista = {
  tipo?: unknown;
  medico?: unknown;
  extras?: { horarios?: unknown } | null;
};

/** O profissional tem escala habitual que alcança a janela pedida? */
function atendeNaJanela(r: RegistroLista, j: JanelaHorario): boolean {
  const linhas = Array.isArray(r.extras?.horarios)
    ? (r.extras!.horarios as Array<{ inicio?: unknown; fim?: unknown }>)
    : [];
  return linhas.some((h) => {
    const inicio = typeof h.inicio === "string" ? h.inicio : "";
    const fim = typeof h.fim === "string" ? h.fim : "";
    if (!inicio || !fim) return false;
    return (!j.aPartir || fim > j.aPartir) && (!j.ate || inicio < j.ate);
  });
}

/**
 * Lista de uma especialidade com restrição de horário do paciente: mantém só
 * os profissionais cuja escala habitual alcança a janela. A regra dos 8
 * passa a contar essa lista. Sem ninguém na janela, nada é filtrado.
 */
export function filtrarListaPorHorario<
  D extends {
    records?: unknown;
    doctors?: unknown;
    instrucao?: unknown;
    tipo_atendimento?: unknown;
  },
>(
  ferramenta: string,
  argumentos: string | null | undefined,
  dados: D | null | undefined,
  mensagem: string,
): D | null {
  if (ferramenta !== "consultar_cadastro" || !dados || !Array.isArray(dados.records)) return null;
  if (dados.tipo_atendimento === "exame_procedimento") return null;
  let args: { medico?: unknown } = {};
  try {
    args = JSON.parse(argumentos ?? "{}") ?? {};
  } catch {
    /* sem filtro */
  }
  if (typeof args.medico === "string" && args.medico.trim()) return null;
  const janela = janelaHorarioPedida(mensagem);
  if (!janela) return null;
  const registros = dados.records as RegistroLista[];
  const profissionais = registros.filter((r) => r.tipo === "profissional");
  if (profissionais.length < 2) return null;
  const naJanela = profissionais.filter((r) => atendeNaJanela(r, janela));
  if (!naJanela.length || naJanela.length === profissionais.length) return null;
  const records = registros.filter((r) => r.tipo !== "profissional" || naJanela.includes(r));
  const doctors = [
    ...new Set(
      naJanela
        .flatMap((r) => String(r.medico ?? "").split(","))
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ];
  return {
    ...dados,
    records,
    doctors,
    instrucao: [
      typeof dados.instrucao === "string" ? dados.instrucao : "",
      `O paciente pediu atendimento ${janela.descricao}. Estes são os profissionais cuja escala habitual alcança esse horário (${naJanela.length} de ${profissionais.length}); apresente somente eles, com dias e horários. Escala não é vaga.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
