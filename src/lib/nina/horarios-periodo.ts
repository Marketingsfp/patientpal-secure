/**
 * Apresentação dos horários livres por período (26/09/2026).
 *
 * - Até 10 horários distintos no dia: todos.
 * - Mais de 10: a Nina pergunta o período, citando só os que têm vaga. Com um
 *   único período com vaga, não há o que perguntar: mostra os primeiros dele.
 * - Com período (ou "a partir de"), mostra até 10 em ordem cronológica e avisa
 *   quando há mais. "Mostrar os próximos" continua de onde parou, sem repetir.
 *
 * O limite de EXIBIÇÃO (10) não limita a CONSULTA: o dia é lido inteiro e a
 * paginação fica no estado da conversa, presa a clínica, sessão, profissional,
 * atendimento e data. Puro (sem rede), testável.
 *
 * Períodos definidos pela clínica, no fuso America/Sao_Paulo:
 * madrugada 00:00–04:59 · manhã 05:00–11:59 · tarde 12:00–17:59 · noite 18:00–23:59.
 */
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";

export type Periodo = "madrugada" | "manha" | "tarde" | "noite";
export const PERIODOS: ReadonlyArray<{ id: Periodo; rotulo: string; inicioMin: number; fimMin: number }> = [
  { id: "madrugada", rotulo: "de madrugada", inicioMin: 0, fimMin: 5 * 60 },
  { id: "manha", rotulo: "pela manhã", inicioMin: 5 * 60, fimMin: 12 * 60 },
  { id: "tarde", rotulo: "à tarde", inicioMin: 12 * 60, fimMin: 18 * 60 },
  { id: "noite", rotulo: "à noite", inicioMin: 18 * 60, fimMin: 24 * 60 },
];
export const PERIODOS_IDS = PERIODOS.map((p) => p.id) as [Periodo, ...Periodo[]];
export const LIMITE_EXIBICAO = 10;

/** "HH:MM" → minutos do dia; inválido → NaN. */
export function minutosDoDia(hora: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : Number.NaN;
}

export function periodoDaHora(hora: string): Periodo | null {
  const t = minutosDoDia(hora);
  return PERIODOS.find((p) => t >= p.inicioMin && t < p.fimMin)?.id ?? null;
}

export type HorarioSlot = { medico_id: string; inicio: string; hora: string };

/** Mesmo profissional e mesmo início = um horário, mesmo com várias vagas (fichas). */
export const chaveHorario = (s: HorarioSlot) => `${s.medico_id}|${Date.parse(s.inicio)}`;

export function horariosDistintos<T extends HorarioSlot>(slots: T[]): T[] {
  const vistos = new Set<string>();
  return [...slots]
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio) || a.medico_id.localeCompare(b.medico_id))
    .filter((s) => {
      const k = chaveHorario(s);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

export type FiltroHorarios = {
  /** "qualquer" = tanto faz: o dia inteiro em ordem cronológica. */
  periodo?: Periodo | "qualquer" | null;
  /** "depois das 14h" → "14:00". */
  a_partir_de?: string | null;
};

export type ResumoPeriodo = { periodo: Periodo; rotulo: string; quantidade: number; primeiro: string; ultimo: string };

export function periodosComVagas(slots: HorarioSlot[]): ResumoPeriodo[] {
  const distintos = horariosDistintos(slots);
  return PERIODOS.flatMap((p) => {
    const doPeriodo = distintos.filter((s) => periodoDaHora(s.hora) === p.id);
    return doPeriodo.length
      ? [{ periodo: p.id, rotulo: p.rotulo, quantidade: doPeriodo.length,
          primeiro: doPeriodo[0]!.hora, ultimo: doPeriodo.at(-1)!.hora }]
      : [];
  });
}

function aplicarFiltro<T extends HorarioSlot>(distintos: T[], f: FiltroHorarios): T[] {
  const desde = f.a_partir_de ? minutosDoDia(f.a_partir_de) : Number.NaN;
  return distintos.filter((s) =>
    (!f.periodo || f.periodo === "qualquer" || periodoDaHora(s.hora) === f.periodo) &&
    (Number.isNaN(desde) || minutosDoDia(s.hora) >= desde));
}

const temFiltro = (f: FiltroHorarios | null | undefined): f is FiltroHorarios =>
  Boolean(f && (f.periodo || f.a_partir_de));

export type PlanoHorarios<T> =
  | { modo: "todos"; horarios: T[]; total: number }
  | { modo: "escolher_periodo"; periodos: ResumoPeriodo[]; total: number }
  | { modo: "lista"; horarios: T[]; filtro: FiltroHorarios; restantes: number; total_no_filtro: number; continuacao: boolean }
  | { modo: "esgotado"; filtro: FiltroHorarios; periodos: ResumoPeriodo[]; total_no_filtro: number }
  | { modo: "sem_horarios_no_filtro"; filtro: FiltroHorarios; periodos: ResumoPeriodo[]; total: number };

/**
 * Decide o que mostrar de UM dia. `jaApresentados` só vale com `mais`:
 * a próxima página nunca repete horários já mostrados.
 */
export function planejarHorarios<T extends HorarioSlot>(
  slots: T[],
  e: { filtro?: FiltroHorarios | null; mais?: boolean; jaApresentados?: readonly string[]; limite?: number } = {},
): PlanoHorarios<T> {
  const limite = e.limite ?? LIMITE_EXIBICAO;
  const distintos = horariosDistintos(slots);
  const periodos = periodosComVagas(distintos);
  if (!temFiltro(e.filtro) && !e.mais) {
    if (distintos.length <= limite) return { modo: "todos", horarios: distintos, total: distintos.length };
    if (periodos.length > 1) return { modo: "escolher_periodo", periodos, total: distintos.length };
  }
  // Um só período com vaga, "tanto faz" ou "mostra os outros" sem filtro: ordem cronológica do dia.
  const filtro: FiltroHorarios = temFiltro(e.filtro) ? e.filtro : { periodo: "qualquer" };
  const filtrados = aplicarFiltro(distintos, filtro);
  if (!filtrados.length) return { modo: "sem_horarios_no_filtro", filtro, periodos, total: distintos.length };
  const vistos = new Set(e.mais ? e.jaApresentados ?? [] : []);
  const candidatos = filtrados.filter((s) => !vistos.has(chaveHorario(s)));
  if (!candidatos.length) return { modo: "esgotado", filtro, periodos, total_no_filtro: filtrados.length };
  const horarios = candidatos.slice(0, limite);
  return { modo: "lista", horarios, filtro, restantes: candidatos.length - horarios.length,
    total_no_filtro: filtrados.length, continuacao: e.mais === true && vistos.size > 0 };
}

/* ------------------------------------------------ paginação na conversa */

export type PaginacaoHorarios = {
  clinica_id: string;
  session_id: string | null;
  /** Profissional/especialidade, atendimento e data que definem a lista. */
  chave: string;
  filtro: FiltroHorarios | null;
  /** O que a Nina perguntou por último: período ou horário. */
  aguardando: "periodo" | "horario";
  periodos_oferecidos: Periodo[];
  apresentados: string[];
};

type EstadoComPaginacao = EstadoFluxoNina & {
  appointment: EstadoFluxoNina["appointment"] & { paginacao_horarios?: PaginacaoHorarios | null };
};

export function chavePaginacao(c: { medicoId?: string | null; especialidadeId?: string | null;
  atendimento?: string | null; data: string }): string {
  return JSON.stringify([c.medicoId ?? null, c.especialidadeId ?? null, c.atendimento ?? null, c.data]);
}

/** Paginação desta clínica, sessão e lista; qualquer troca (ou reset) começa do zero. */
export function paginacaoVigente(
  estado: EstadoFluxoNina | null | undefined,
  clinicaId: string,
  chave?: string,
): PaginacaoHorarios | null {
  const p = (estado as EstadoComPaginacao | null | undefined)?.appointment?.paginacao_horarios;
  if (!p || p.clinica_id !== clinicaId || p.session_id !== (estado?.session_id ?? null)) return null;
  return chave === undefined || p.chave === chave ? p : null;
}

export function registrarPaginacao(
  estado: EstadoFluxoNina | null | undefined,
  pag: Omit<PaginacaoHorarios, "session_id">,
) {
  if (!estado) return;
  (estado as EstadoComPaginacao).appointment.paginacao_horarios = { ...pag, session_id: estado.session_id ?? null };
}

export function limparPaginacao(estado: EstadoFluxoNina | null | undefined) {
  if (estado) (estado as EstadoComPaginacao).appointment.paginacao_horarios = null;
}

/* ------------------------------------------- respostas naturais do paciente */

export type RespostaHorarios =
  | { tipo: "periodo"; periodo: Periodo }
  | { tipo: "a_partir_de"; hora: string }
  | { tipo: "qualquer" }
  | { tipo: "mais" };

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lê a resposta à pergunta de período ou a pedido de mais opções. Devolve null
 * quando a mensagem não é sobre isso (a Nina decide pelo contexto completo).
 */
export function interpretarRespostaHorarios(texto: string): RespostaHorarios | null {
  const t = sem(texto).replace(/\s+/g, " ").trim();
  if (!t || t.length > 120) return null;
  if (/\b(outros|outras|proximos|proximas|seguintes|demais) (horarios|opcoes)\b|\bmais (opcoes|horarios)\b|^(e )?(os |as )?(outros|outras|proximos|proximas|demais)\??$|\b(mostra|mostre|manda|mande|ver)( os| as)? (outros|outras|proximos|proximas|demais)\b/.test(t))
    return { tipo: "mais" };
  const depois = /\b(depois|a partir|apos|após) (das?|de) (\d{1,2})(?:[:h](\d{2}))?\s*h?\b/.exec(t);
  if (depois) {
    const h = Number(depois[3]);
    if (h < 24) return { tipo: "a_partir_de", hora: `${String(h).padStart(2, "0")}:${depois[4] ?? "00"}` };
  }
  if (/\b(tanto faz|qualquer (um|uma|periodo|horario|hora)|pode ser qualquer|sem preferencia|o que tiver)\b/.test(t))
    return { tipo: "qualquer" };
  if (/\bdepois do almoco\b|\b(a |de |pela |na )?tarde\b/.test(t)) return { tipo: "periodo", periodo: "tarde" };
  if (/\bmadrugada\b/.test(t)) return { tipo: "periodo", periodo: "madrugada" };
  if (/\b(a |de |pela |na )?manha\b|\bcedo\b|\bmais cedo\b/.test(t)) return { tipo: "periodo", periodo: "manha" };
  if (/\b(a |de |pela |na )?noite\b/.test(t)) return { tipo: "periodo", periodo: "noite" };
  return null;
}

/**
 * O que a Nina espera do paciente sobre horários nesta sessão (para o Jev):
 * a escolha do período ou de um horário da lista apresentada.
 */
export function escolhaDeHorariosPendente(estado: EstadoFluxoNina | null | undefined) {
  const p = (estado as EstadoComPaginacao | null | undefined)?.appointment?.paginacao_horarios;
  if (!p || p.session_id !== (estado?.session_id ?? null)) return null;
  return { aguardando: p.aguardando, periodos_oferecidos: p.periodos_oferecidos };
}

/** Resposta curta que continua a escolha de horários ("de tarde", "tanto faz", "mostra os outros"). */
export function respondeEscolhaDeHorarios(estado: EstadoFluxoNina | null | undefined, mensagem: string): boolean {
  return escolhaDeHorariosPendente(estado) !== null && interpretarRespostaHorarios(mensagem) !== null;
}

/* ----------------------------------------------- textos para a Nina */

export const AVISO_HA_MAIS =
  "Esses são os primeiros horários disponíveis nesse período. Se preferir, posso mostrar os próximos.";
export const AVISO_HA_MAIS_CONTINUACAO =
  "Esses são os próximos horários disponíveis nesse período. Se preferir, posso mostrar mais.";

/** Aviso da página: "próximos" depois da primeira; "nesse dia" para "tanto faz". */
function avisoDaPagina(plano: Extract<PlanoHorarios<unknown>, { modo: "lista" }>) {
  const aviso = plano.continuacao ? AVISO_HA_MAIS_CONTINUACAO : AVISO_HA_MAIS;
  return plano.filtro.periodo === "qualquer" && !plano.filtro.a_partir_de ? aviso.replace("nesse período", "nesse dia") : aviso;
}

/** Instrução do retorno da ferramenta para cada modo do plano. */
export function instrucaoDoPlano(plano: PlanoHorarios<unknown>): string {
  const lista = (ps: ResumoPeriodo[]) => ps.map((p) => `${p.rotulo} (${p.quantidade})`).join(", ");
  switch (plano.modo) {
    case "todos":
      return "Apresente TODOS os horários de `horarios` (são poucos), em ordem cronológica.";
    case "escolher_periodo":
      return `Há mais de ${LIMITE_EXIBICAO} horários livres neste dia. Ainda NÃO liste horários: pergunte qual período o paciente prefere, citando somente estes períodos com vaga: ${lista(plano.periodos)}. Ex.: "Para esse dia, temos horários pela manhã e à tarde. Qual período você prefere?". Se ele responder um período, "depois das X", "tanto faz" ou pedir para ver, consulte de novo com o filtro correspondente. Muitos horários não são motivo de encaminhamento.`;
    case "lista":
      return plano.restantes > 0
        ? `Apresente os horários de \`horarios\` em ordem cronológica e termine dizendo exatamente: "${avisoDaPagina(plano)}" (não repita a frase da página anterior). Se o paciente pedir mais opções, consulte de novo com mais=true: ainda restam ${plano.restantes} horário(s) nesse filtro. Não diga que acabaram os horários.`
        : "Apresente os horários de `horarios` em ordem cronológica. Estes são todos os horários restantes desse filtro.";
    case "esgotado":
      return `Todos os ${plano.total_no_filtro} horários desse filtro já foram apresentados. Diga isso e ofereça outro período com vaga (${lista(plano.periodos)}) ou outra data. O dia ainda tem vagas: não afirme que não há horários.`;
    case "sem_horarios_no_filtro":
      return `Não há horário livre no período pedido nesse dia. Ofereça somente os períodos com vaga: ${lista(plano.periodos)}, ou outra data.`;
  }
}
