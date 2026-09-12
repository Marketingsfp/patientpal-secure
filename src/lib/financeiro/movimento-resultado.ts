/**
 * Cards do Movimento de Caixa — a mesma separação do Financeiro → Dashboard,
 * mas pela régua da GAVETA.
 *
 * Por que a régua é outra
 * -----------------------
 * O Dashboard conta pelo dia do atendimento (Rateio da Receita) e mostra o
 * repasse que se deve ao médico. O Movimento de Caixa existe para bater com o
 * cupom impresso da recepção: aqui só entra o que passou pelo caixa no
 * período, e o repasse é o que foi PAGO. Em 10/09/2026 as duas réguas davam
 * R$ 40.043,17 (atendimentos do dia) contra R$ 44.907,45 (dinheiro que entrou)
 * — usar a do Rateio aqui faria o cupom deixar de bater.
 *
 * O que muda em relação à composição antiga
 * -----------------------------------------
 *  - Atendimento separado em Particular, Cartão Benefícios e Convênio, pelo
 *    mesmo critério do Rateio (modalidade gravada no lançamento, contrato
 *    ativo do paciente e texto da descrição).
 *  - Fim do balaio "Outros": o que caía lá eram exames que a tela não achava
 *    no cadastro (ver `tipoDoProcedimento` e a paginação do cadastro na tela) e
 *    exames de laboratório, que a agenda grava com o serviço em branco. O que
 *    sobra sem atendimento nem mensalidade é recebimento avulso e fica em
 *    Outras receitas, com esse nome.
 *  - Despesa separada em repasse pago, complemento médico e operacional, pela
 *    mesma regra do Dashboard (`grupoDaDespesa`).
 *
 * Sangria e suprimento (`tipo = "transferencia"`) não entram em nenhum card:
 * são troca de custódia dentro da clínica, não receita nem despesa.
 */
import { classificarReceita, type GrupoReceita } from "@/lib/financeiro/composicao-receita";
import {
  classificarForma,
  LABEL_FORMA,
  ORDEM_FORMAS,
  type FormaCanonica,
} from "@/lib/financeiro/formas-pagamento";
import { resolverModalidade, type MapaConvenioPaciente } from "@/lib/convenio/modalidade";
import { formaDoAtendimento } from "@/lib/repasse-calc";
import { grupoDaDespesa, type GrupoDespesa } from "@/lib/financeiro/painel-financeiro";
import { SEM_CATEGORIA } from "@/lib/financeiro/filtro-categoria";

const round2 = (v: number) => +v.toFixed(2);

export type CondicaoAtendimento = "particular" | "cartao" | "convenio";

export const CONDICOES: CondicaoAtendimento[] = ["particular", "cartao", "convenio"];

export const LABEL_CONDICAO: Record<CondicaoAtendimento, string> = {
  particular: "Particular",
  cartao: "Cartão Benefícios",
  convenio: "Convênio",
};

/** Grupo de cada receita do caixa. Os dois primeiros são atendimento. */
export type GrupoMovimento = Exclude<GrupoReceita, "outros"> | "avulso";

export const GRUPOS_OUTRAS: GrupoMovimento[] = [
  "adesao",
  "mensalidade_periodo",
  "mensalidade_atrasada",
  "mensalidade_antecipada",
  "avulso",
];

export const LABEL_GRUPO_MOV: Record<GrupoMovimento, string> = {
  consulta: "Consultas",
  exame_procedimento: "Exames e procedimentos",
  adesao: "Adesão (novos)",
  mensalidade_periodo: "Referente ao período",
  mensalidade_atrasada: "Atrasados",
  mensalidade_antecipada: "Antecipados",
  avulso: "Recebimentos avulsos",
};

export const ehAtendimento = (g: GrupoMovimento | null): boolean =>
  g === "consulta" || g === "exame_procedimento";

/** O mínimo que a tela precisa passar de cada linha. */
export interface LinhaMovimento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data: string;
  hora?: string | null;
  categoria_id: string | null;
  forma_pagamento: string | null;
  formaCanonica?: FormaCanonica;
  procedimento?: string | null;
  mensalidadeVencimento?: string | null;
  mensalidadeParcela?: number | null;
  paciente_id?: string | null;
  convenio_modalidade?: string | null;
  empresa_id?: string | null;
  agendamento_id?: string | null;
  medico_nome?: string | null;
  ficha_numero?: number | null;
  /** Usuário que fez o lançamento. */
  criado_por?: string | null;
  /** Lançamento de origem, quando a linha é uma parte de pagamento misto. */
  _mistoPaiId?: string;
}

export interface LinhaClassificada extends LinhaMovimento {
  categoria_nome: string;
  /** Nome de quem lançou; vazio quando o lançamento não guardou o usuário. */
  usuario_nome: string;
  forma: FormaCanonica;
  /** Só receita. */
  grupo: GrupoMovimento | null;
  /** Só receita de atendimento. */
  condicao: CondicaoAtendimento | null;
  /** Só despesa. */
  grupoDespesa: GrupoDespesa | null;
}

export interface ContextoClassificacao {
  periodo: { de: string; ate: string };
  /** Nome do procedimento em caixa alta → tipo do cadastro. */
  procTipos: Map<string, string>;
  mapaConvenio: MapaConvenioPaciente | null;
  nomeCategoria: (id: string | null) => string | null;
  /** Nome do funcionário pelo id do usuário. */
  nomeUsuario?: (id: string | null) => string | null;
}

/** Serviço escrito na descrição do pagamento: "PACIENTE — EXAMES LABORATORIAIS". */
export function servicoDaDescricao(descricao: string | null | undefined): string | null {
  const partes = String(descricao ?? "").split("—");
  if (partes.length < 2) return null;
  const servico = partes.slice(1).join("—").trim();
  return servico || null;
}

/**
 * Particular, Cartão ou Convênio — o mesmo critério do Rateio da Receita.
 *
 * Convênio é o lançamento de empresa conveniada (`empresa_id`). O Cartão
 * Benefícios sai da modalidade gravada no lançamento, do contrato ativo do
 * paciente ou, em lançamento antigo sem nenhum dos dois, do texto da
 * descrição. Em setembro de 2026 todos os convênios cadastrados são da
 * modalidade Cartão Consulta, então o Convênio aparece zerado — o card só é
 * mostrado quando há valor.
 */
export function condicaoDoLancamento(
  l: Pick<LinhaMovimento, "descricao" | "convenio_modalidade" | "paciente_id" | "empresa_id">,
  mapa: MapaConvenioPaciente | null,
): CondicaoAtendimento {
  if (l.empresa_id) return "convenio";
  const modalidade = resolverModalidade({
    modalidadeLancamento: l.convenio_modalidade ?? null,
    pacienteId: l.paciente_id ?? null,
    mapa,
  });
  const forma = formaDoAtendimento(l.descricao, modalidade);
  return forma === "cartao_consulta" || forma === "cartao_desconto" ? "cartao" : "particular";
}

/**
 * Grupo de uma receita do caixa.
 *
 * Pagamento ligado a agendamento é SEMPRE atendimento. Quando o serviço da
 * agenda está em branco — é o caso do laboratório, que grava a agenda sem
 * serviço e escreve "EXAMES LABORATORIAIS" na descrição (63 pagamentos,
 * R$ 9.897,10, de 01 a 10/09/2026) — o serviço é lido da descrição; e se nem
 * assim o cadastro reconhecer, ele entra como consulta quando o texto diz
 * consulta e como exame/procedimento no resto. Antes tudo isso caía em
 * "Outros".
 */
export function grupoDaReceita(l: LinhaMovimento, ctx: ContextoClassificacao): GrupoMovimento {
  const servico = l.procedimento?.trim()
    ? l.procedimento
    : l.agendamento_id
      ? servicoDaDescricao(l.descricao)
      : null;
  const base = classificarReceita(
    {
      tipo: "receita",
      categoria: ctx.nomeCategoria(l.categoria_id),
      procedimento: servico,
      mensalidadeVencimento: l.mensalidadeVencimento,
      mensalidadeParcela: l.mensalidadeParcela,
    },
    ctx.periodo,
    ctx.procTipos,
  );
  if (base !== "outros") return base;
  if (!l.agendamento_id) return "avulso";
  return /CONSULTA/i.test(servico ?? l.descricao) ? "consulta" : "exame_procedimento";
}

export function classificarMovimento(
  linhas: LinhaMovimento[],
  ctx: ContextoClassificacao,
): LinhaClassificada[] {
  return linhas.map((l) => {
    const categoria_nome =
      (ctx.nomeCategoria(l.categoria_id) ?? "").trim().toUpperCase() || SEM_CATEGORIA;
    const forma = l.formaCanonica ?? classificarForma(l.forma_pagamento);
    const usuario_nome = ctx.nomeUsuario?.(l.criado_por ?? null) ?? "";
    if (l.tipo === "receita") {
      const grupo = grupoDaReceita(l, ctx);
      return {
        ...l,
        categoria_nome,
        usuario_nome,
        forma,
        grupo,
        condicao: ehAtendimento(grupo) ? condicaoDoLancamento(l, ctx.mapaConvenio) : null,
        grupoDespesa: null,
      };
    }
    return {
      ...l,
      categoria_nome,
      usuario_nome,
      forma,
      grupo: null,
      condicao: null,
      grupoDespesa: l.tipo === "despesa" ? grupoDaDespesa(categoria_nome, l.descricao) : null,
    };
  });
}

/** Card da composição em que o usuário clicou para filtrar a lista. */
export interface FiltroCard {
  grupo: GrupoMovimento;
  condicao?: CondicaoAtendimento;
}

export const linhaCasaComFiltro = (l: LinhaClassificada, f: FiltroCard): boolean =>
  l.tipo === "receita" && l.grupo === f.grupo && (!f.condicao || l.condicao === f.condicao);

export const mesmoFiltro = (a: FiltroCard | null, b: FiltroCard | null): boolean =>
  !!a && !!b && a.grupo === b.grupo && a.condicao === b.condicao;

export const rotuloFiltro = (f: FiltroCard): string =>
  f.condicao
    ? `${LABEL_GRUPO_MOV[f.grupo]} · ${LABEL_CONDICAO[f.condicao]}`
    : LABEL_GRUPO_MOV[f.grupo];

export interface TotalQtd {
  total: number;
  qtd: number;
}

export interface ResumoMovimento {
  /** Receita de atendimento (Particular + Cartão + Convênio). */
  atendimentos: TotalQtd & {
    /** Fichas distintas (agendamentos) pagas no período. */
    fichas: number;
    porCondicao: Record<CondicaoAtendimento, TotalQtd & { consulta: TotalQtd; exame: TotalQtd }>;
    /** Quebra por forma: Dinheiro, PIX, Cartão e o que mais houver. */
    formas: Array<{ rotulo: string; valor: number }>;
  };
  /** Mensalidades, adesões e recebimentos avulsos. */
  outras: TotalQtd & { porGrupo: Record<GrupoMovimento, TotalQtd> };
  receitas: number;
  /**
   * Receita bruta do caixa: tudo que entrou, na mesma régua do Dashboard, com
   * a quebra por forma de pagamento e a contagem de pagamentos recebidos —
   * cada pagamento conta como um atendimento (12/09/2026).
   */
  receitaBruta: TotalQtd & { formas: Array<{ rotulo: string; valor: number }> };
  repassePago: TotalQtd;
  complementoMedico: TotalQtd;
  operacionais: TotalQtd;
  despesas: number;
  saldo: number;
  /**
   * O mesmo saldo, separado pelo lugar onde o dinheiro está: a GAVETA
   * (espécie) e o BANCO (PIX, cartões, boleto, transferência). É o que
   * permite conferir se a sobra em dinheiro do fechamento bate — antes o card
   * mostrava só um número só, misturando o que está na mão com o que só cai
   * na conta.
   */
  saldoMeios: SaldoPorMeio;
}

export interface MeioSaldo {
  /** Receitas recebidas nesse meio. */
  entradas: number;
  /** Despesas pagas nesse meio. */
  saidas: number;
  /** entradas − saídas. */
  saldo: number;
}

export interface SaldoPorMeio {
  /** Dinheiro vivo — o que precisa estar na gaveta. */
  especie: MeioSaldo;
  /** PIX, cartões, boleto e transferência — cai na conta. */
  banco: MeioSaldo;
  /** Convênio, gratuidade, misto não decomposto e sem informação. */
  outros: MeioSaldo;
}

/** Formas que representam dinheiro em conta bancária. */
const FORMAS_BANCO: FormaCanonica[] = [
  "pix",
  "debito",
  "credito",
  "legado_cartao",
  "boleto",
  "transferencia",
];

const meioDaForma = (f: FormaCanonica): keyof SaldoPorMeio =>
  f === "dinheiro" ? "especie" : FORMAS_BANCO.includes(f) ? "banco" : "outros";

/**
 * Separa entradas e saídas do período em espécie, banco e outros.
 * Função pura: recebe as mesmas linhas já classificadas do movimento.
 */
export function saldoPorMeio(linhas: LinhaClassificada[]): SaldoPorMeio {
  const zero = (): MeioSaldo => ({ entradas: 0, saidas: 0, saldo: 0 });
  const out: SaldoPorMeio = { especie: zero(), banco: zero(), outros: zero() };
  for (const l of linhas) {
    const alvo = out[meioDaForma(l.forma)];
    const v = Number(l.valor) || 0;
    if (l.tipo === "receita") alvo.entradas += v;
    else alvo.saidas += v;
  }
  for (const k of ["especie", "banco", "outros"] as const) {
    out[k].entradas = round2(out[k].entradas);
    out[k].saidas = round2(out[k].saidas);
    out[k].saldo = round2(out[k].entradas - out[k].saidas);
  }
  return out;
}



/**
 * Quantidade de PAGAMENTOS: as partes de um pagamento misto contam uma vez
 * só, pelo lançamento de origem.
 */
function contar(linhas: LinhaClassificada[]): TotalQtd {
  const ids = new Set(linhas.map((l) => l._mistoPaiId ?? l.id));
  return { total: round2(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)), qtd: ids.size };
}

const CARTAO_NA_BARRA: FormaCanonica[] = ["debito", "credito", "legado_cartao"];

export function resumoMovimento(linhas: LinhaClassificada[]): ResumoMovimento {
  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const atend = receitas.filter((l) => ehAtendimento(l.grupo));
  const outras = receitas.filter((l) => !ehAtendimento(l.grupo));

  const porCondicao = Object.fromEntries(
    CONDICOES.map((c) => {
      const daCondicao = atend.filter((l) => l.condicao === c);
      return [
        c,
        {
          ...contar(daCondicao),
          consulta: contar(daCondicao.filter((l) => l.grupo === "consulta")),
          exame: contar(daCondicao.filter((l) => l.grupo === "exame_procedimento")),
        },
      ];
    }),
  ) as ResumoMovimento["atendimentos"]["porCondicao"];

  // Dinheiro, PIX e Cartão sempre aparecem, mesmo zerados — são as três
  // colunas que a recepção confere. As demais formas só quando têm valor, para
  // a lista fechar com o total.
  const quebraPorForma = (linhas: LinhaClassificada[]): Array<{ rotulo: string; valor: number }> => {
    const porForma = new Map<FormaCanonica, number>();
    for (const l of linhas) porForma.set(l.forma, (porForma.get(l.forma) ?? 0) + Number(l.valor));
    const saida: Array<{ rotulo: string; valor: number }> = [
      { rotulo: "Dinheiro", valor: round2(porForma.get("dinheiro") ?? 0) },
      { rotulo: "PIX", valor: round2(porForma.get("pix") ?? 0) },
      {
        rotulo: "Cartão",
        valor: round2(CARTAO_NA_BARRA.reduce((s, f) => s + (porForma.get(f) ?? 0), 0)),
      },
    ];
    for (const f of ORDEM_FORMAS) {
      if (f === "dinheiro" || f === "pix" || CARTAO_NA_BARRA.includes(f)) continue;
      const v = round2(porForma.get(f) ?? 0);
      if (v !== 0) saida.push({ rotulo: LABEL_FORMA[f], valor: v });
    }
    return saida;
  };
  const formas = quebraPorForma(atend);


  const porGrupo = Object.fromEntries(
    (["consulta", "exame_procedimento", ...GRUPOS_OUTRAS] as GrupoMovimento[]).map((g) => [
      g,
      contar(receitas.filter((l) => l.grupo === g)),
    ]),
  ) as Record<GrupoMovimento, TotalQtd>;

  const totAtend = contar(atend);
  const totOutras = contar(outras);
  const repassePago = contar(despesas.filter((l) => l.grupoDespesa === "repasse_pago"));
  const complementoMedico = contar(despesas.filter((l) => l.grupoDespesa === "complemento_medico"));
  const operacionais = contar(despesas.filter((l) => l.grupoDespesa === "operacional"));
  const totalReceitas = round2(totAtend.total + totOutras.total);
  const totalDespesas = round2(repassePago.total + complementoMedico.total + operacionais.total);
  return {
    atendimentos: {
      ...totAtend,
      fichas: new Set(atend.map((l) => l.agendamento_id).filter(Boolean)).size,
      porCondicao,
      formas,
    },
    outras: { ...totOutras, porGrupo },
    receitas: totalReceitas,
    receitaBruta: { ...contar(receitas), formas: quebraPorForma(receitas) },

    repassePago,
    complementoMedico,
    operacionais,
    despesas: totalDespesas,
    saldo: round2(totalReceitas - totalDespesas),
  };
}

/**
 * Nome de quem recebeu um pagamento de repasse. A tela de repasse grava
 * "REPASSE MEDICO — NOME (N ATEND.)"; quando o lançamento tem médico
 * vinculado, vale o cadastro.
 */
export function favorecidoDoRepasse(l: Pick<LinhaMovimento, "medico_nome" | "descricao">): string {
  if (l.medico_nome?.trim()) return l.medico_nome.trim();
  const m = l.descricao.match(/REPASSE\s+M[EÉ]DICO\s*—\s*(.+?)\s*(\(\d+\s*ATEND\.?\))?\s*$/i);
  return (m?.[1] ?? l.descricao).trim();
}
