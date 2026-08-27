/**
 * As pílulas de período (Dia, Semana, Quinzena, Mês, Período) e o intervalo
 * exato que cada uma cobre.
 *
 * O cálculo do intervalo morava dentro de `@/components/date-range-filter`.
 * Ele saiu de lá por dois motivos: passou a ser lido também pela dica que
 * aparece ao parar o mouse em cima da pílula, e regra de data merece teste —
 * o componente é `.tsx` e a suíte (`bun test`) não monta React.
 *
 * Por que a dica existe
 * ---------------------
 * A pílula acesa dizia só "Semana", e ninguém tinha como saber se a semana
 * começava no domingo ou na segunda, se a quinzena era 1–15 ou os últimos 15
 * dias, nem em que dia o mês fechava. Quem confere caixa precisava clicar,
 * olhar o resultado e deduzir. Agora cada pílula anuncia o intervalo em
 * dd/mm/aaaa antes do clique — inclusive as que ainda não estão selecionadas.
 *
 * As datas são tratadas como texto puro `YYYY-MM-DD` sempre que possível,
 * pelo mesmo motivo de `@/lib/financeiro/periodos`: o mesmo código roda no
 * navegador da clínica (BRT) e no Worker do SSR (UTC).
 */

/** Intervalo fechado, nas duas pontas, em `YYYY-MM-DD`. */
export type DateRange = { from: string; to: string };

/** As pílulas do seletor, na ordem em que aparecem na tela. */
export type DatePreset = "hoje" | "semana" | "quinzena" | "mes" | "periodo";

/** Rótulo curto de cada pílula — o mesmo texto escrito dentro dela. */
export const ROTULO_PRESET: Record<DatePreset, string> = {
  hoje: "Dia",
  semana: "Semana",
  quinzena: "Quinzena",
  mes: "Mês",
  periodo: "Período",
};

/**
 * Título da dica. Não repete o rótulo da pílula: diz QUAL recorte é aplicado
 * ("Semana atual" e não "Semana"), porque o seletor sempre parte de hoje.
 */
const TITULO_PRESET: Record<DatePreset, string> = {
  hoje: "Hoje",
  semana: "Semana atual",
  quinzena: "Quinzena atual",
  mes: "Mês atual",
  periodo: "Período personalizado",
};

/**
 * A regra por trás do recorte, em linguagem de recepção. É o que responde as
 * dúvidas que faziam a equipe clicar para descobrir.
 */
const REGRA_PRESET: Record<DatePreset, string> = {
  hoje: "Somente o dia de hoje.",
  semana: "Da semana em que hoje está: de domingo a sábado.",
  quinzena: "A quinzena em que hoje está: do dia 1 ao 15, ou do 16 ao fim do mês.",
  mes: "Do primeiro ao último dia do mês em que hoje está.",
  periodo: "Datas escolhidas à mão nos campos ao lado.",
};

const toISO = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** "2026-08-24" → "24/08/2026". Sem `Date`, para não escorregar de fuso. */
export const dataBR = (iso: string): string => {
  const [y, m, d] = String(iso ?? "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

/**
 * O intervalo que cada pílula aplica, tomando `ref` como "hoje".
 *
 * "periodo" não tem intervalo próprio — ele é digitado pelo usuário —, então
 * cai no mês corrente, que é o que a tela já mostrava quando essa pílula era
 * escolhida sem mexer nas datas.
 */
export function computeRange(preset: DatePreset, ref: Date = new Date()): DateRange {
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  if (preset === "hoje") return { from: toISO(today), to: toISO(today) };
  if (preset === "semana") {
    const dow = today.getDay(); // 0 = dom
    const start = new Date(today);
    start.setDate(today.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toISO(start), to: toISO(end) };
  }
  if (preset === "quinzena") {
    const d = today.getDate();
    if (d <= 15) {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 15);
      return { from: toISO(start), to: toISO(end) };
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 16);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toISO(start), to: toISO(end) };
  }
  // mes
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toISO(start), to: toISO(end) };
}

/** Quantos dias o intervalo cobre, contando as duas pontas. */
export function diasDoIntervalo(r: DateRange): number {
  const ms = Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms / 86400000) + 1;
}

/** O que a dica de uma pílula mostra. */
export interface DescricaoPreset {
  /** Ex.: "Semana atual". */
  titulo: string;
  /** Ex.: "24/08/2026 a 30/08/2026" — ou só a data quando é um dia só. */
  intervalo: string;
  /** Ex.: "Semana atual: 24/08/2026 a 30/08/2026". Uma linha, pronta. */
  resumo: string;
  /** Quantos dias o intervalo cobre. */
  dias: number;
  /** Ex.: "7 dias". */
  duracao: string;
  /** A regra do recorte, em linguagem comum. */
  regra: string;
}

/**
 * Descreve o intervalo de uma pílula.
 *
 * `valorAtual` só é usado em "Período": ali o intervalo é o que está digitado
 * nos campos de data, e não um recorte calculado. Nas outras pílulas ele é
 * ignorado de propósito — a dica precisa dizer o que aquela pílula VAI
 * aplicar, mesmo quando a selecionada no momento é outra.
 */
export function descricaoDoPreset(
  preset: DatePreset,
  valorAtual?: DateRange,
  ref: Date = new Date(),
): DescricaoPreset {
  const r =
    preset === "periodo" && valorAtual?.from && valorAtual?.to
      ? valorAtual
      : computeRange(preset, ref);
  const dias = diasDoIntervalo(r);
  const intervalo = r.from === r.to ? dataBR(r.from) : `${dataBR(r.from)} a ${dataBR(r.to)}`;
  const titulo = TITULO_PRESET[preset];
  return {
    titulo,
    intervalo,
    resumo: `${titulo}: ${intervalo}`,
    dias,
    duracao: dias === 1 ? "1 dia" : `${dias} dias`,
    regra: REGRA_PRESET[preset],
  };
}
