/**
 * Inteligência da aba Projeção a partir da AGENDA — módulo puro (sem banco,
 * sem React).
 *
 * A projeção de receita (`./projecao`) lê o caixa. Aqui a fonte é o resumo
 * da agenda por dia × agenda (`fin_agenda_resumo_dia`), que responde três
 * perguntas da gestão:
 *
 *  1. A chuva derruba o comparecimento? (clima × agenda)
 *  2. Quais especialidades crescem, quais caem, e onde agir?
 *  3. Quais agendas carregam o volume do mês?
 *
 * Regras que valem para tudo abaixo:
 *  - Domingo não é dia de funcionamento e fica fora de toda conta.
 *  - O dia de hoje ainda está acontecendo: entra no "realizado", mas não entra
 *    em taxa de falta nem em ritmo (senão toda tarde pareceria um dia fraco).
 *  - Nada aqui inventa dado: com pouca amostra, o resultado diz que é pouca.
 */

import { diaDaSemana, diasDeFuncionamento } from "./preset-periodo";

/** Uma linha de `fin_agenda_resumo_dia`. */
export interface LinhaAgendaDia {
  dia: string;
  agenda_id: string | null;
  agenda_nome: string | null;
  ordem_chegada: boolean;
  medico_id: string | null;
  medico_nome: string | null;
  especialidade: string | null;
  /** Vagas da grade (livres + marcadas), sem as canceladas. */
  vagas: number;
  /** Vagas com paciente. */
  marcados: number;
  /** Pacientes marcados que vieram. */
  compareceu: number;
  /** Marcações com paciente canceladas. Ausente antes da migração 20260914210000. */
  cancelados?: number;
}

/** O mínimo de clima que a análise usa — compatível com `ClimaDia`. */
export interface ClimaMinimo {
  precipitacao_mm: number | null;
  weather_code: number | null;
}

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const um = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// 1. CLIMA × COMPARECIMENTO
// ---------------------------------------------------------------------------

export type TipoTempo = "estavel" | "chuva" | "tempestade";

export const ROTULO_TEMPO: Record<TipoTempo, string> = {
  estavel: "Tempo estável",
  chuva: "Chuva",
  tempestade: "Chuva forte / tempestade",
};

/** A partir de 15 mm no dia, ou trovoada no código WMO (95–99), é chuva forte. */
export const LIMIAR_TEMPESTADE_MM = 15;
/** Abaixo de 1 mm é garoa sem efeito — mesmo limiar de `@/lib/clima`. */
export const LIMIAR_CHUVA_MM = 1;

export function classificarTempo(c: ClimaMinimo): TipoTempo | null {
  const mm = c.precipitacao_mm;
  const code = c.weather_code ?? -1;
  if (mm == null && code < 0) return null;
  if ((code >= 95 && code <= 99) || (mm ?? 0) >= LIMIAR_TEMPESTADE_MM) return "tempestade";
  if ((mm ?? 0) >= LIMIAR_CHUVA_MM) return "chuva";
  return "estavel";
}

export interface DiaAgenda {
  dia: string;
  vagas: number;
  marcados: number;
  compareceu: number;
}

/** Soma as agendas de cada dia. */
export function totaisPorDia(linhas: LinhaAgendaDia[]): DiaAgenda[] {
  const mapa = new Map<string, DiaAgenda>();
  for (const l of linhas) {
    let d = mapa.get(l.dia);
    if (!d) {
      d = { dia: l.dia, vagas: 0, marcados: 0, compareceu: 0 };
      mapa.set(l.dia, d);
    }
    d.vagas += Number(l.vagas) || 0;
    d.marcados += Number(l.marcados) || 0;
    d.compareceu += Number(l.compareceu) || 0;
  }
  return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

export interface GrupoTempo {
  tipo: TipoTempo;
  dias: number;
  /** Comparecimento médio do grupo em relação ao normal do mesmo dia da semana (1 = normal). */
  indice: number;
  /** Diferença de comparecimento contra os dias de tempo estável, em %. */
  variacao: number;
  /** Faltas / marcados, em %. */
  taxaFalta: number;
  marcados: number;
  faltas: number;
}

export interface ImpactoClima {
  grupos: GrupoTempo[];
  diasAnalisados: number;
  /** Dias fora da curva (feriado, sistema parado) que não entraram na conta. */
  diasDescartados: number;
  /** Dias sem dado de clima. */
  diasSemClima: number;
  /** true quando chuva e tempo estável têm ao menos 5 dias cada. */
  confiavel: boolean;
}

/** Abaixo disto, a média de um grupo de tempo é anedota, não padrão. */
export const MIN_DIAS_GRUPO = 5;

const mediana = (v: number[]) => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface DiasValidos {
  /** Dias fechados (antes de hoje, sem domingo) em que a agenda foi usada de verdade. */
  validos: Set<string>;
  /** Comparecimento normal (mediana) de cada dia da semana, 1 = segunda. */
  normal: Map<number, number>;
  /** Dias com agenda que ficaram fora por estarem muito abaixo do normal. */
  descartados: number;
  dias: DiaAgenda[];
}

/**
 * Quais dias servem de base para média e comparação.
 *
 * Em produção houve períodos em que a recepção voltou ao sistema antigo e a
 * agenda daqui quase não recebeu marcação — de 30/07 a 16/08/2026 foram
 * 10 a 40 comparecimentos por dia, contra 300 a 400 no normal. Somar esses
 * dias faria agosto parecer um mês fraco e setembro "crescer" 1.000%. Um dia
 * só vale quando o comparecimento chega a 40% do normal do mesmo dia da semana
 * (o que também tira feriado e dia de sistema parado, como 26/08/2026).
 *
 * O normal é a mediana, em duas passadas: a primeira acha os dias fora da
 * curva; a segunda é recalculada sem eles, para não puxar o normal para baixo.
 */
export function diasValidos(linhas: LinhaAgendaDia[], hoje: string): DiasValidos {
  const dias = totaisPorDia(linhas).filter(
    (d) => d.dia < hoje && diaDaSemana(d.dia) !== 0 && d.marcados > 0,
  );
  const medianasPorDow = (lista: DiaAgenda[]) => {
    const porDow = new Map<number, number[]>();
    for (const d of lista) {
      const dow = diaDaSemana(d.dia);
      porDow.set(dow, [...(porDow.get(dow) ?? []), d.compareceu]);
    }
    return new Map([...porDow].map(([dow, v]) => [dow, mediana(v)]));
  };
  const bruto = medianasPorDow(dias);
  const normal = medianasPorDow(
    dias.filter((d) => d.compareceu >= (bruto.get(diaDaSemana(d.dia)) ?? 0) * 0.4),
  );
  const validos = new Set<string>();
  for (const d of dias) {
    const ref = normal.get(diaDaSemana(d.dia)) ?? 0;
    if (ref > 0 && d.compareceu >= ref * 0.4) validos.add(d.dia);
  }
  return { validos, normal, descartados: dias.length - validos.size, dias };
}

/**
 * Compara o comparecimento dos dias de chuva com os de tempo estável.
 *
 * Comparar números brutos engana: sábado tem metade do movimento de uma
 * terça, e se choveu em três sábados a chuva "derrubaria" o movimento sem
 * culpa nenhuma. Por isso cada dia é medido contra o normal do mesmo dia da
 * semana (índice 1 = um dia normal), e só depois agrupado por tempo. Só
 * entram os dias válidos de `diasValidos`.
 */
export function impactoDoClima(
  linhas: LinhaAgendaDia[],
  clima: Map<string, ClimaMinimo>,
  hoje: string,
): ImpactoClima {
  const base = diasValidos(linhas, hoje);

  let semClima = 0;
  const acc = new Map<
    TipoTempo,
    { dias: number; soma: number; marcados: number; faltas: number }
  >();
  for (const d of base.dias) {
    if (!base.validos.has(d.dia)) continue;
    const ref = base.normal.get(diaDaSemana(d.dia)) ?? 0;
    const c = clima.get(d.dia);
    const tipo = c ? classificarTempo(c) : null;
    if (!tipo) {
      semClima++;
      continue;
    }
    const g = acc.get(tipo) ?? { dias: 0, soma: 0, marcados: 0, faltas: 0 };
    g.dias++;
    g.soma += d.compareceu / ref;
    g.marcados += d.marcados;
    g.faltas += Math.max(d.marcados - d.compareceu, 0);
    acc.set(tipo, g);
  }

  const indiceEstavel = acc.get("estavel")
    ? acc.get("estavel")!.soma / acc.get("estavel")!.dias
    : 0;
  const ordem: TipoTempo[] = ["estavel", "chuva", "tempestade"];
  const grupos: GrupoTempo[] = ordem
    .filter((t) => acc.has(t))
    .map((t) => {
      const g = acc.get(t)!;
      const indice = g.soma / g.dias;
      return {
        tipo: t,
        dias: g.dias,
        indice: Math.round(indice * 1000) / 1000,
        variacao: indiceEstavel > 0 ? um((indice / indiceEstavel - 1) * 100) : 0,
        taxaFalta: um(pct(g.faltas, g.marcados)),
        marcados: g.marcados,
        faltas: g.faltas,
      };
    });

  const diasDe = (t: TipoTempo) => acc.get(t)?.dias ?? 0;
  return {
    grupos,
    diasAnalisados: grupos.reduce((s, g) => s + g.dias, 0),
    diasDescartados: base.descartados,
    diasSemClima: semClima,
    confiavel:
      diasDe("estavel") >= MIN_DIAS_GRUPO &&
      diasDe("chuva") + diasDe("tempestade") >= MIN_DIAS_GRUPO,
  };
}

export interface PrevisaoMinima extends ClimaMinimo {
  data: string;
  probabilidade_chuva: number | null;
}

export interface PrognosticoMes {
  /** Dias de funcionamento que ainda faltam no mês, a partir de amanhã. */
  diasRestantes: number;
  /** Quantos deles a previsão alcança. */
  diasComPrevisao: number;
  /** Último dia coberto pela previsão (AAAA-MM-DD), ou null. */
  previsaoAte: string | null;
  diasChuva: number;
  diasTempestade: number;
  /** Comparecimentos que o histórico sugere perder nesses dias; 0 sem histórico confiável. */
  perdaEstimada: number;
}

/**
 * Dia previsto conta como chuvoso quando a chance de chuva é de 60% ou mais
 * e o volume previsto passa de 1 mm — só "chance" alta com garoa não muda
 * nada no balcão.
 */
export function tempoPrevisto(p: PrevisaoMinima): TipoTempo | null {
  const tipo = classificarTempo(p);
  if (!tipo || tipo === "estavel") return tipo;
  return (p.probabilidade_chuva ?? 100) >= 60 ? tipo : "estavel";
}

/**
 * O que a previsão diz sobre o resto do mês. A Open-Meteo prevê 16 dias:
 * perto do começo do mês a previsão não chega ao fim dele, e a tela precisa
 * dizer até onde ela vai em vez de fingir que cobre tudo.
 */
export function prognosticoDoMes(
  previsao: PrevisaoMinima[],
  impacto: ImpactoClima,
  mediaAtendidosDia: number,
  hoje: string,
  fimMes: string,
): PrognosticoMes {
  const amanha = new Date(`${hoje}T00:00:00Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const de = amanha.toISOString().slice(0, 10);
  const diasRestantes = de > fimMes ? 0 : diasDeFuncionamento({ from: de, to: fimMes });

  const futuros = previsao.filter(
    (p) => p.data >= de && p.data <= fimMes && diaDaSemana(p.data) !== 0,
  );
  // Grupo com poucos dias não serve de régua: chuva forte sem amostra usa a
  // régua da chuva comum; sem nenhuma das duas, não se estima perda.
  const grupo = (t: TipoTempo) =>
    impacto.grupos.find((g) => g.tipo === t && g.dias >= MIN_DIAS_GRUPO);
  const variacao = (t: TipoTempo) =>
    (grupo(t) ?? (t === "tempestade" ? grupo("chuva") : undefined))?.variacao ?? 0;
  let diasChuva = 0;
  let diasTempestade = 0;
  let perda = 0;
  for (const p of futuros) {
    const t = tempoPrevisto(p);
    if (t === "chuva") diasChuva++;
    if (t === "tempestade") diasTempestade++;
    if (impacto.confiavel && (t === "chuva" || t === "tempestade")) {
      perda += (Math.max(-variacao(t), 0) / 100) * mediaAtendidosDia;
    }
  }
  return {
    diasRestantes,
    diasComPrevisao: futuros.length,
    previsaoAte: futuros.length ? futuros[futuros.length - 1].data : null,
    diasChuva,
    diasTempestade,
    perdaEstimada: Math.round(perda),
  };
}

// ---------------------------------------------------------------------------
// 2. ESPECIALIDADES
// ---------------------------------------------------------------------------

export interface EntradaPeriodo {
  /** Primeiro dia do mês corrente. */
  inicioMes: string;
  /** Último dia do mês corrente. */
  fimMes: string;
  hoje: string;
  /** Mês anterior inteiro — base da comparação. */
  mesAnteriorDe: string;
  mesAnteriorAte: string;
}

/** Dias de funcionamento do mês: totais, já fechados (até ontem) e que faltam (inclui hoje). */
export function diasDoMes(p: Pick<EntradaPeriodo, "inicioMes" | "fimMes" | "hoje">): {
  totais: number;
  decorridos: number;
  restantes: number;
} {
  const totais = diasDeFuncionamento({ from: p.inicioMes, to: p.fimMes });
  const ontem = new Date(`${p.hoje}T00:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const ontemIso = ontem.toISOString().slice(0, 10);
  const decorridos =
    ontemIso < p.inicioMes ? 0 : diasDeFuncionamento({ from: p.inicioMes, to: ontemIso });
  return { totais, decorridos, restantes: Math.max(totais - decorridos, 0) };
}

/** Quantos dias válidos há em cada recorte — o divisor das médias. */
export interface ContextoComparacao {
  diasValidosMes: number;
  diasValidosAnterior: number;
  /** false quando o mês anterior tem menos de 5 dias válidos: não há com o que comparar. */
  temBaseAnterior: boolean;
}

export function contextoComparacao(
  base: DiasValidos,
  p: Pick<EntradaPeriodo, "inicioMes" | "mesAnteriorDe" | "mesAnteriorAte">,
): ContextoComparacao {
  let mes = 0;
  let ant = 0;
  for (const d of base.validos) {
    if (d >= p.inicioMes) mes++;
    else if (d >= p.mesAnteriorDe && d <= p.mesAnteriorAte) ant++;
  }
  return { diasValidosMes: mes, diasValidosAnterior: ant, temBaseAnterior: ant >= 5 };
}

/**
 * Estimativa do mês inteiro: o que já veio até ontem mais a média por dia
 * válido repetida nos dias que faltam. Nunca menos do que já foi atendido.
 */
const projetar = (ateOntem: number, atendidos: number, diasValidos: number, restantes: number) =>
  Math.max(
    Math.round(ateOntem + (diasValidos > 0 ? (ateOntem / diasValidos) * restantes : 0)),
    atendidos,
  );

export interface LinhaEspecialidade {
  especialidade: string;
  /** Comparecimentos do mês até hoje. */
  atendidos: number;
  /** Estimativa do mês inteiro. */
  projetado: number;
  /** Média de comparecimentos por dia válido neste mês. */
  mediaDia: number;
  /** Média por dia válido no mês anterior. */
  mediaDiaAnterior: number;
  /** Total de comparecimentos no mês anterior (dias válidos). */
  totalAnterior: number;
  /** A média do mês anterior aplicada aos dias deste mês — marca de referência do gráfico. */
  ritmoAnteriorNoMes: number;
  /** % da média diária contra o mês anterior; null sem base suficiente. */
  variacao: number | null;
  /** Marcados ÷ vagas no mês, em %; null quando só há agenda por ordem de chegada. */
  ocupacao: number | null;
  vagasLivres: number;
  taxaFalta: number;
  faltas: number;
}

const SEM_ESPECIALIDADE = "SEM ESPECIALIDADE";

export function rankingEspecialidades(
  linhas: LinhaAgendaDia[],
  p: EntradaPeriodo,
  base: DiasValidos = diasValidos(linhas, p.hoje),
): LinhaEspecialidade[] {
  const { totais, restantes } = diasDoMes(p);
  const ctx = contextoComparacao(base, p);
  type Acc = {
    atendidos: number;
    ateOntem: number;
    anterior: number;
    vagas: number;
    marcadosGrade: number;
    marcadosFechados: number;
    compareceuFechados: number;
  };
  const mapa = new Map<string, Acc>();
  const pegar = (esp: string | null) => {
    const k = (esp ?? "").trim() || SEM_ESPECIALIDADE;
    let a = mapa.get(k);
    if (!a) {
      a = {
        atendidos: 0,
        ateOntem: 0,
        anterior: 0,
        vagas: 0,
        marcadosGrade: 0,
        marcadosFechados: 0,
        compareceuFechados: 0,
      };
      mapa.set(k, a);
    }
    return a;
  };

  for (const l of linhas) {
    if (diaDaSemana(l.dia) === 0) continue;
    const c = Number(l.compareceu) || 0;
    const m = Number(l.marcados) || 0;
    const valido = base.validos.has(l.dia);
    if (l.dia >= p.inicioMes && l.dia <= p.hoje) {
      const a = pegar(l.especialidade);
      a.atendidos += c;
      if (valido || l.dia === p.hoje) {
        // Agenda por ordem de chegada gera vagas que não são "oferta" de
        // horário marcado — medir ocupação nela daria um número sem sentido.
        if (!l.ordem_chegada) {
          a.vagas += Number(l.vagas) || 0;
          a.marcadosGrade += m;
        }
      }
      if (valido) {
        a.ateOntem += c;
        a.marcadosFechados += m;
        a.compareceuFechados += c;
      }
    } else if (valido && l.dia >= p.mesAnteriorDe && l.dia <= p.mesAnteriorAte) {
      pegar(l.especialidade).anterior += c;
    }
  }

  return [...mapa.entries()]
    .map(([especialidade, a]) => {
      const faltas = Math.max(a.marcadosFechados - a.compareceuFechados, 0);
      const mediaDia = ctx.diasValidosMes > 0 ? a.ateOntem / ctx.diasValidosMes : 0;
      const mediaDiaAnterior = ctx.temBaseAnterior ? a.anterior / ctx.diasValidosAnterior : 0;
      return {
        especialidade,
        atendidos: a.atendidos,
        projetado: projetar(a.ateOntem, a.atendidos, ctx.diasValidosMes, restantes),
        mediaDia: um(mediaDia),
        mediaDiaAnterior: um(mediaDiaAnterior),
        totalAnterior: a.anterior,
        ritmoAnteriorNoMes: Math.round(mediaDiaAnterior * totais),
        variacao:
          ctx.temBaseAnterior && ctx.diasValidosMes >= 3 && a.anterior >= 20
            ? um(pct(mediaDia - mediaDiaAnterior, mediaDiaAnterior))
            : null,
        ocupacao: a.vagas > 0 ? um(pct(a.marcadosGrade, a.vagas)) : null,
        vagasLivres: Math.max(a.vagas - a.marcadosGrade, 0),
        taxaFalta: um(pct(faltas, a.marcadosFechados)),
        faltas,
      };
    })
    .filter((e) => e.atendidos + e.totalAnterior > 0)
    .sort((x, y) => y.projetado - x.projetado || y.atendidos - x.atendidos);
}

export interface Diagnostico {
  id: string;
  especialidade: string;
  titulo: string;
  acao: string;
  gravidade: "alta" | "media" | "positiva";
}

/**
 * Onde focar. Só dispara com amostra mínima (20 atendimentos no mês anterior,
 * 100 vagas na grade, 15 faltas) para não transformar oscilação de
 * especialidade pequena em alarme.
 */
export function diagnosticoEspecialidades(
  ranking: LinhaEspecialidade[],
  nomeMesAnterior = "o mês passado",
): Diagnostico[] {
  const out: Diagnostico[] = [];
  const dia = (v: number) => v.toLocaleString("pt-BR");
  for (const e of ranking) {
    if (e.especialidade === SEM_ESPECIALIDADE) continue;
    if (e.variacao != null && e.variacao <= -15) {
      out.push({
        id: `queda-${e.especialidade}`,
        especialidade: e.especialidade,
        titulo: `${e.especialidade}: procura caiu ${dia(Math.abs(e.variacao))}%`,
        acao: `Média de ${dia(e.mediaDia)} atendimento(s) por dia, contra ${dia(e.mediaDiaAnterior)} em ${nomeMesAnterior}. Vale campanha de captação e checar se houve médico ausente ou horário a menos.`,
        gravidade: e.variacao <= -30 ? "alta" : "media",
      });
    }
    // Ociosidade e agenda lotada ficam em `./projecao-melhorias`, que mede
    // também os dias em que a grade encheu por completo.
    if (e.faltas >= 15 && e.taxaFalta >= 20) {
      out.push({
        id: `faltas-${e.especialidade}`,
        especialidade: e.especialidade,
        titulo: `${e.especialidade}: ${dia(e.taxaFalta)}% dos marcados faltaram`,
        acao: `${dia(e.faltas)} faltas no mês. Confirmar na véspera (WhatsApp/telefone) e liberar a vaga de quem não confirmar.`,
        gravidade: e.taxaFalta >= 35 ? "alta" : "media",
      });
    }
    if (e.variacao != null && e.variacao >= 20) {
      out.push({
        id: `alta-${e.especialidade}`,
        especialidade: e.especialidade,
        titulo: `${e.especialidade}: procura subiu ${dia(e.variacao)}%`,
        acao: "Especialidade em alta — garantir que a grade acompanhe para não perder paciente.",
        gravidade: "positiva",
      });
    }
  }
  const peso = { alta: 0, media: 1, positiva: 2 } as const;
  return out.sort((a, b) => peso[a.gravidade] - peso[b.gravidade]);
}

// ---------------------------------------------------------------------------
// 3. AGENDAS POR VOLUME
// ---------------------------------------------------------------------------

export interface LinhaAgendaVolume {
  chave: string;
  medico: string;
  agenda: string;
  especialidade: string;
  ordemChegada: boolean;
  atendidos: number;
  projetado: number;
  ocupacao: number | null;
  taxaFalta: number;
}

/** Faixas de volume projetado no mês, da maior para a menor. */
export const FAIXAS_VOLUME = [
  { id: "300", rotulo: "300 ou mais atendimentos no mês", min: 300 },
  { id: "100", rotulo: "De 100 a 299", min: 100 },
  { id: "30", rotulo: "De 30 a 99", min: 30 },
  { id: "0", rotulo: "Menos de 30", min: 0 },
] as const;

export function faixaDoVolume(projetado: number): (typeof FAIXAS_VOLUME)[number]["id"] {
  return (FAIXAS_VOLUME.find((f) => projetado >= f.min) ?? FAIXAS_VOLUME[3]).id;
}

export function agendasPorVolume(
  linhas: LinhaAgendaDia[],
  p: EntradaPeriodo,
  base: DiasValidos = diasValidos(linhas, p.hoje),
): LinhaAgendaVolume[] {
  const { restantes } = diasDoMes(p);
  const { diasValidosMes } = contextoComparacao(base, p);
  type Acc = LinhaAgendaVolume & {
    ateOntem: number;
    vagas: number;
    marcados: number;
    marcadosFechados: number;
    compareceuFechados: number;
  };
  const mapa = new Map<string, Acc>();
  for (const l of linhas) {
    if (l.dia < p.inicioMes || l.dia > p.hoje || diaDaSemana(l.dia) === 0) continue;
    const valido = base.validos.has(l.dia);
    if (!valido && l.dia !== p.hoje) continue;
    const chave = `${l.agenda_id ?? "-"}|${l.medico_id ?? "-"}`;
    let a = mapa.get(chave);
    if (!a) {
      a = {
        chave,
        medico: l.medico_nome?.trim() || "Sem médico",
        agenda: l.agenda_nome?.trim() || "Sem agenda",
        especialidade: l.especialidade?.trim() || SEM_ESPECIALIDADE,
        ordemChegada: !!l.ordem_chegada,
        atendidos: 0,
        projetado: 0,
        ocupacao: null,
        taxaFalta: 0,
        ateOntem: 0,
        vagas: 0,
        marcados: 0,
        marcadosFechados: 0,
        compareceuFechados: 0,
      };
      mapa.set(chave, a);
    }
    const c = Number(l.compareceu) || 0;
    const m = Number(l.marcados) || 0;
    a.atendidos += c;
    a.vagas += Number(l.vagas) || 0;
    a.marcados += m;
    if (valido) {
      a.ateOntem += c;
      a.marcadosFechados += m;
      a.compareceuFechados += c;
    }
  }
  return [...mapa.values()]
    .filter((a) => a.vagas > 0 || a.atendidos > 0)
    .map((a) => ({
      chave: a.chave,
      medico: a.medico,
      agenda: a.agenda,
      especialidade: a.especialidade,
      ordemChegada: a.ordemChegada,
      atendidos: a.atendidos,
      projetado: projetar(a.ateOntem, a.atendidos, diasValidosMes, restantes),
      ocupacao: a.ordemChegada || a.vagas === 0 ? null : um(pct(a.marcados, a.vagas)),
      taxaFalta: um(
        pct(Math.max(a.marcadosFechados - a.compareceuFechados, 0), a.marcadosFechados),
      ),
    }))
    .sort((x, y) => y.projetado - x.projetado || x.medico.localeCompare(y.medico));
}
