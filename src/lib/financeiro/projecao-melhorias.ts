/**
 * "O que dá para melhorar" (Financeiro → Projeção) — módulo puro.
 *
 * Três perguntas, cada uma com evidência dos próprios dados:
 *
 *  1. ALERTA DE QUEDA — que dia deste mês faturou abaixo do normal, e POR QUÊ:
 *     quais especialidades e médicos puxaram a queda, se faltou agenda, se
 *     subiram faltas ou cancelamentos, e como ficaram particular e Cartão.
 *  2. OCIOSIDADE — especialidades com a agenda sobrando.
 *  3. OPORTUNIDADE DE EXPANSÃO — especialidades que lotam a grade.
 *
 * "Normal" é sempre o do MESMO dia da semana. Com a média geral, todo sábado
 * (meio expediente) virava dia fraco: 05/09/2026 fez R$ 23,3 mil contra
 * R$ 46 mil de média do mês, mas os sábados anteriores tinham feito entre
 * R$ 25 mil e R$ 29 mil — ele estava a 10% do próprio normal, não a 50%.
 */

import { diaDaSemana } from "./preset-periodo";
import type { ClimaMinimo, DiasValidos, LinhaAgendaDia } from "./projecao-agenda";
import { classificarTempo } from "./projecao-agenda";

/** Uma linha de `fin_receita_resumo_dia`. */
export interface LinhaReceitaDia {
  dia: string;
  medico_id: string | null;
  medico_nome: string | null;
  especialidade: string | null;
  /** Recebimento pela tabela do Cartão Consulta. */
  cartao: boolean;
  pagamentos: number;
  receita: number;
}

const SEM_ESPECIALIDADE = "SEM ESPECIALIDADE";
const SEM_VINCULO = "Sem vínculo com a agenda";

const cent = (v: number) => Math.round(v * 100) / 100;
const um = (v: number) => Math.round(v * 10) / 10;
const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);

const mediana = (v: number[]) => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------------
// 1. ALERTA DE QUEDA
// ---------------------------------------------------------------------------

/** Abaixo de 80% do normal do dia da semana é queda. */
export const LIMIAR_QUEDA = 0.8;
/** Abaixo de 40% não é "dia fraco": é feriado, clínica fechada ou sistema pouco usado. */
export const LIMIAR_ATIPICO = 0.4;

export interface ItemQueda {
  nome: string;
  /** Só para médicos. */
  especialidade?: string;
  /** Receita habitual nesse dia da semana. */
  normal: number;
  noDia: number;
  diferenca: number;
  /** Não teve nenhum recebimento no dia, mas costuma ter. */
  ausente: boolean;
  /** Situação da agenda do médico no dia (só para médicos). */
  agenda?: "sem_agenda" | "agenda_vazia" | "normal";
}

export interface ComparativoModalidade {
  normal: number;
  noDia: number;
  variacao: number;
}

export interface DiaComQueda {
  dia: string;
  receita: number;
  normal: number;
  /** % abaixo do normal (positivo = queda). */
  queda: number;
  /** Quantos dias iguais da semana formaram o normal. */
  base: number;
  especialidades: ItemQueda[];
  medicos: ItemQueda[];
  faltas: { noDia: number; normal: number } | null;
  cancelados: { noDia: number; normal: number } | null;
  particular: ComparativoModalidade;
  cartao: ComparativoModalidade;
  tempo: "estavel" | "chuva" | "tempestade" | null;
  /** Os motivos, prontos para a tela, do mais forte ao mais fraco. */
  motivos: string[];
}

export interface DiaAtipico {
  dia: string;
  receita: number;
  normal: number;
}

export interface ResultadoQuedas {
  quedas: DiaComQueda[];
  atipicos: DiaAtipico[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type TotDia = {
  receita: number;
  pagCartao: number;
  pagParticular: number;
};

function totaisReceita(receitas: LinhaReceitaDia[]): Map<string, TotDia> {
  const m = new Map<string, TotDia>();
  for (const r of receitas) {
    let t = m.get(r.dia);
    if (!t) {
      t = { receita: 0, pagCartao: 0, pagParticular: 0 };
      m.set(r.dia, t);
    }
    t.receita += Number(r.receita) || 0;
    if (r.cartao) t.pagCartao += Number(r.pagamentos) || 0;
    else t.pagParticular += Number(r.pagamentos) || 0;
  }
  return m;
}

/**
 * Dias deste mês (até ontem) abaixo do normal do próprio dia da semana, com
 * os motivos.
 *
 * O normal é a mediana, em duas passadas (a primeira acha os dias parados; a
 * segunda recalcula sem eles). A queda só é diagnosticada com pelo menos dois
 * dias iguais de referência — com um só, "normal" seria o acaso de um dia.
 */
export function diagnosticarQuedas(
  receitas: LinhaReceitaDia[],
  agenda: LinhaAgendaDia[],
  clima: Map<string, ClimaMinimo> | null,
  p: { inicioMes: string; hoje: string },
): ResultadoQuedas {
  const tot = totaisReceita(receitas);
  const dias = [...tot.keys()].filter((d) => d < p.hoje && diaDaSemana(d) !== 0).sort();

  const porDow = (lista: string[]) => {
    const g = new Map<number, number[]>();
    for (const d of lista) {
      const w = diaDaSemana(d);
      g.set(w, [...(g.get(w) ?? []), tot.get(d)!.receita]);
    }
    return new Map([...g].map(([w, v]) => [w, mediana(v)]));
  };
  const bruto = porDow(dias);
  const validosLista = dias.filter(
    (d) => tot.get(d)!.receita >= (bruto.get(diaDaSemana(d)) ?? 0) * LIMIAR_ATIPICO,
  );
  const normal = porDow(validosLista);
  const validos = new Set(
    dias.filter((d) => tot.get(d)!.receita >= (normal.get(diaDaSemana(d)) ?? 0) * LIMIAR_ATIPICO),
  );

  const quedas: DiaComQueda[] = [];
  const atipicos: DiaAtipico[] = [];

  for (const d of dias) {
    if (d < p.inicioMes) continue;
    const w = diaDaSemana(d);
    const ref = [...validos].filter((x) => x !== d && diaDaSemana(x) === w);
    if (ref.length < 2) continue;
    const normalDia = mediana(ref.map((x) => tot.get(x)!.receita));
    const receita = tot.get(d)!.receita;
    if (normalDia <= 0) continue;
    if (!validos.has(d)) {
      atipicos.push({ dia: d, receita: cent(receita), normal: cent(normalDia) });
      continue;
    }
    if (receita >= normalDia * LIMIAR_QUEDA) continue;
    quedas.push(explicarQueda(d, ref, receitas, agenda, clima, tot, normalDia));
  }

  quedas.sort((a, b) => b.queda - a.queda);
  return { quedas, atipicos };
}

function explicarQueda(
  d: string,
  ref: string[],
  receitas: LinhaReceitaDia[],
  agenda: LinhaAgendaDia[],
  clima: Map<string, ClimaMinimo> | null,
  tot: Map<string, TotDia>,
  normalDia: number,
): DiaComQueda {
  const refSet = new Set(ref);
  const n = ref.length;
  const receita = tot.get(d)!.receita;

  // --- por especialidade e por médico: média nos dias de referência × dia.
  const esp = new Map<string, { ref: number; dia: number }>();
  const med = new Map<
    string,
    { nome: string; esp: string; ref: number; dia: number; diasPresente: number }
  >();
  const presencaMed = new Map<string, Set<string>>();
  for (const r of receitas) {
    const noRef = refSet.has(r.dia);
    if (!noRef && r.dia !== d) continue;
    const v = Number(r.receita) || 0;
    const ke = r.especialidade?.trim() || (r.medico_id ? SEM_ESPECIALIDADE : SEM_VINCULO);
    const e = esp.get(ke) ?? { ref: 0, dia: 0 };
    if (noRef) e.ref += v;
    else e.dia += v;
    esp.set(ke, e);

    if (!r.medico_id) continue;
    const m = med.get(r.medico_id) ?? {
      nome: r.medico_nome?.trim() || "Médico sem nome",
      esp: r.especialidade?.trim() || SEM_ESPECIALIDADE,
      ref: 0,
      dia: 0,
      diasPresente: 0,
    };
    if (noRef) {
      m.ref += v;
      const s = presencaMed.get(r.medico_id) ?? new Set<string>();
      s.add(r.dia);
      presencaMed.set(r.medico_id, s);
    } else m.dia += v;
    med.set(r.medico_id, m);
  }

  const quedaTotal = Math.max(normalDia - receita, 0);
  // Só vale citar quem explica ao menos 5% da queda (e R$ 200): o resto é ruído.
  const relevante = (dif: number) => dif <= -Math.max(200, quedaTotal * 0.05);

  const especialidades: ItemQueda[] = [...esp.entries()]
    .map(([nome, e]) => {
      const normal = e.ref / n;
      return {
        nome,
        normal: cent(normal),
        noDia: cent(e.dia),
        diferenca: cent(e.dia - normal),
        ausente: e.dia === 0 && normal > 0,
      };
    })
    .filter((x) => relevante(x.diferenca))
    .sort((a, b) => a.diferenca - b.diferenca)
    .slice(0, 5);

  // Agenda do médico no dia: tinha vaga? tinha paciente?
  const agendaDia = new Map<string, { vagas: number; marcados: number }>();
  for (const l of agenda) {
    if (l.dia !== d || !l.medico_id) continue;
    const a = agendaDia.get(l.medico_id) ?? { vagas: 0, marcados: 0 };
    a.vagas += Number(l.vagas) || 0;
    a.marcados += Number(l.marcados) || 0;
    agendaDia.set(l.medico_id, a);
  }

  const medicos: ItemQueda[] = [...med.entries()]
    .map(([id, m]) => {
      const normal = m.ref / n;
      const presente = (presencaMed.get(id)?.size ?? 0) / n >= 0.5;
      const ag = agendaDia.get(id);
      return {
        nome: m.nome,
        especialidade: m.esp,
        normal: cent(normal),
        noDia: cent(m.dia),
        diferenca: cent(m.dia - normal),
        ausente: m.dia === 0 && presente,
        agenda:
          !ag || ag.vagas === 0
            ? ("sem_agenda" as const)
            : ag.marcados <= ag.vagas * 0.1
              ? ("agenda_vazia" as const)
              : ("normal" as const),
      };
    })
    .filter((x) => relevante(x.diferenca))
    .sort((a, b) => a.diferenca - b.diferenca)
    .slice(0, 6);

  // --- faltas e cancelamentos, pela agenda.
  const somaAgenda = (dias: Set<string>) => {
    let marcados = 0;
    let compareceu = 0;
    let cancelados = 0;
    let temCancel = false;
    for (const l of agenda) {
      if (!dias.has(l.dia)) continue;
      marcados += Number(l.marcados) || 0;
      compareceu += Number(l.compareceu) || 0;
      if (l.cancelados != null) {
        temCancel = true;
        cancelados += Number(l.cancelados) || 0;
      }
    }
    return { marcados, faltas: Math.max(marcados - compareceu, 0), cancelados, temCancel };
  };
  const aDia = somaAgenda(new Set([d]));
  const aRef = somaAgenda(refSet);
  const faltas =
    aDia.marcados > 0 && aRef.marcados > 0
      ? { noDia: um(pct(aDia.faltas, aDia.marcados)), normal: um(pct(aRef.faltas, aRef.marcados)) }
      : null;
  const cancelados =
    aDia.temCancel || aRef.temCancel
      ? { noDia: aDia.cancelados, normal: um(aRef.cancelados / n) }
      : null;

  // --- particular × Cartão, em quantidade de atendimentos pagos.
  const mod = (campo: "pagCartao" | "pagParticular"): ComparativoModalidade => {
    const normal = ref.reduce((s, x) => s + (tot.get(x)?.[campo] ?? 0), 0) / n;
    const noDia = tot.get(d)?.[campo] ?? 0;
    return {
      normal: um(normal),
      noDia,
      variacao: normal > 0 ? um(pct(noDia - normal, normal)) : 0,
    };
  };
  const particular = mod("pagParticular");
  const cartao = mod("pagCartao");

  const c = clima?.get(d);
  const tempo = c ? classificarTempo(c) : null;

  // --- motivos em linguagem de gestão.
  const motivos: string[] = [];
  const semAgenda = medicos.filter((m) => m.ausente && m.agenda === "sem_agenda");
  if (semAgenda.length) {
    const perda = semAgenda.reduce((s, m) => s - m.diferenca, 0);
    motivos.push(
      `${semAgenda.length === 1 ? "1 médico que costuma atender" : `${semAgenda.length} médicos que costumam atender`} nesse dia da semana não teve agenda: ${semAgenda
        .map((m) => m.nome)
        .join(", ")} — cerca de ${fmtBRL(perda)} a menos.`,
    );
  }
  const vazia = medicos.filter((m) => m.agenda === "agenda_vazia" && m.diferenca < 0);
  if (vazia.length) {
    motivos.push(
      `Agenda aberta, mas quase sem paciente marcado: ${vazia.map((m) => m.nome).join(", ")}.`,
    );
  }
  if (especialidades.length) {
    const top = especialidades.slice(0, 3);
    motivos.push(
      `Maiores quedas por especialidade: ${top
        .map((e) => `${e.nome} (${fmtBRL(e.diferenca)}${e.ausente ? ", sem atendimento" : ""})`)
        .join(", ")}.`,
    );
  }
  if (faltas && faltas.noDia >= faltas.normal + 5 && aDia.faltas >= 5) {
    motivos.push(
      `Faltas acima do normal: ${faltas.noDia.toLocaleString("pt-BR")}% dos marcados não vieram (o normal é ${faltas.normal.toLocaleString("pt-BR")}%).`,
    );
  }
  if (cancelados && cancelados.noDia >= Math.max(3, cancelados.normal * 2)) {
    motivos.push(
      `${cancelados.noDia} cancelamento(s), contra ${cancelados.normal.toLocaleString("pt-BR")} num dia normal.`,
    );
  }
  for (const [nome, m] of [
    ["particular", particular],
    ["Cartão", cartao],
  ] as const) {
    if (m.normal >= 10 && m.variacao <= -20) {
      motivos.push(
        `Atendimentos ${nome === "Cartão" ? "pelo Cartão" : "particulares"} caíram ${Math.abs(m.variacao).toLocaleString("pt-BR")}%: ${m.noDia} contra ${m.normal.toLocaleString("pt-BR")} num dia normal.`,
      );
    }
  }
  if (tempo === "chuva" || tempo === "tempestade") {
    motivos.push(tempo === "tempestade" ? "Dia de chuva forte." : "Dia de chuva.");
  }
  if (motivos.length === 0) {
    motivos.push(
      "A queda veio espalhada por várias especialidades, sem um responsável claro — movimento geral mais fraco no dia.",
    );
  }

  return {
    dia: d,
    receita: cent(receita),
    normal: cent(normalDia),
    queda: um(pct(normalDia - receita, normalDia)),
    base: n,
    especialidades,
    medicos,
    faltas,
    cancelados,
    particular,
    cartao,
    tempo,
    motivos,
  };
}

// ---------------------------------------------------------------------------
// 2 e 3. OCIOSIDADE E OPORTUNIDADE DE EXPANSÃO
// ---------------------------------------------------------------------------

/** Ocupação abaixo disso é agenda sobrando (a gestão pediu a faixa de 60–70%). */
export const LIMIAR_OCIOSA = 65;
/** Ocupação a partir disso é agenda no limite. */
export const LIMIAR_LOTADA = 80;

export interface OcupacaoEspecialidade {
  especialidade: string;
  vagas: number;
  marcados: number;
  ocupacao: number;
  vagasLivres: number;
  /** Dias × agendas em que a grade encheu por completo. */
  diasLotados: number;
  /** Dias × agendas com grade aberta. */
  agendasDia: number;
  /** Médicos cuja agenda lotou ao menos uma vez, do que mais lotou ao que menos. */
  medicosLotados: { nome: string; dias: number }[];
}

export interface OciosidadeOportunidade {
  ociosas: OcupacaoEspecialidade[];
  oportunidades: OcupacaoEspecialidade[];
}

/**
 * Mede a ocupação da grade no mês por especialidade.
 *
 * Fica de fora a agenda por ordem de chegada (a vaga ali não é oferta de
 * horário) e os dias em que a agenda não foi usada neste sistema. A ocupação
 * só enxerga marcações feitas aqui — quem marcou só no sistema antigo não
 * aparece, e a tela avisa isso.
 */
export function ociosidadeEOportunidade(
  agenda: LinhaAgendaDia[],
  p: { inicioMes: string; hoje: string },
  base: DiasValidos,
): OciosidadeOportunidade {
  type Acc = OcupacaoEspecialidade & { lotadosPorMedico: Map<string, number> };
  const mapa = new Map<string, Acc>();
  for (const l of agenda) {
    if (l.dia < p.inicioMes || l.dia > p.hoje || diaDaSemana(l.dia) === 0) continue;
    if (l.ordem_chegada) continue;
    if (!base.validos.has(l.dia) && l.dia !== p.hoje) continue;
    const vagas = Number(l.vagas) || 0;
    if (vagas <= 0) continue;
    const k = l.especialidade?.trim() || SEM_ESPECIALIDADE;
    const a =
      mapa.get(k) ??
      ({
        especialidade: k,
        vagas: 0,
        marcados: 0,
        ocupacao: 0,
        vagasLivres: 0,
        diasLotados: 0,
        agendasDia: 0,
        medicosLotados: [],
        lotadosPorMedico: new Map(),
      } as Acc);
    const marcados = Number(l.marcados) || 0;
    a.vagas += vagas;
    a.marcados += marcados;
    a.agendasDia++;
    if (marcados >= vagas) {
      a.diasLotados++;
      const nome = l.medico_nome?.trim() || "Médico sem nome";
      a.lotadosPorMedico.set(nome, (a.lotadosPorMedico.get(nome) ?? 0) + 1);
    }
    mapa.set(k, a);
  }

  const lista = [...mapa.values()]
    .filter((a) => a.especialidade !== SEM_ESPECIALIDADE)
    .map(({ lotadosPorMedico, ...a }) => ({
      ...a,
      ocupacao: um(pct(a.marcados, a.vagas)),
      vagasLivres: Math.max(a.vagas - a.marcados, 0),
      medicosLotados: [...lotadosPorMedico.entries()]
        .map(([nome, dias]) => ({ nome, dias }))
        .sort((x, y) => y.dias - x.dias),
    }));

  const oportunidades = lista
    .filter(
      (a) =>
        a.marcados >= 20 &&
        (a.ocupacao >= LIMIAR_LOTADA ||
          (a.diasLotados >= 2 && a.diasLotados / a.agendasDia >= 0.15)),
    )
    .sort((x, y) => y.ocupacao - x.ocupacao || y.diasLotados - x.diasLotados);
  const emOportunidade = new Set(oportunidades.map((o) => o.especialidade));

  const ociosas = lista
    .filter(
      (a) =>
        a.ocupacao < LIMIAR_OCIOSA && a.vagasLivres >= 50 && !emOportunidade.has(a.especialidade),
    )
    .sort((x, y) => y.vagasLivres - x.vagasLivres);

  return { ociosas, oportunidades };
}
