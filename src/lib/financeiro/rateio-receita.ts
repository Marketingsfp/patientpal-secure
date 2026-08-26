/**
 * Rateio da Receita — divisão da receita de atendimentos entre a clínica e o
 * prestador (médico), no mesmo formato do relatório do sistema anterior
 * (Clínica Total > Financeiro > Rateio da Receita).
 *
 * O que entra na conta
 * --------------------
 * O universo é o MESMO da aba Financeiro > Atendimentos, para os dois números
 * baterem quando alguém confere um contra o outro:
 *
 *  - `fin_atendimentos` (atendimentos lançados à mão / externos);
 *  - `fin_lancamentos` de receita confirmada ligada a um agendamento.
 *
 * Ficam de fora os recebimentos sem agendamento (mensalidade de cartão,
 * adesão, recebimentos diversos): são receita da clínica, mas não são
 * atendimento de um prestador — entrariam inflando a coluna de quantidade e
 * sem nada a repassar.
 *
 * Competência: para a linha vinda da agenda vale o DIA DO ATENDIMENTO
 * (`agendamentos.inicio`), não o dia em que o paciente pagou no caixa — mesma
 * regra que a aba Atendimentos usa para liberar repasse.
 *
 * Repasse: recalculado pela grade cadastrada do médico (convênio por serviço,
 * por categoria, cartões e Repasse Padrão), pela mesma escada de herança de
 * `@/lib/repasse-calc`. Quando o lançamento da agenda tem repasse editado à
 * mão (`valor_medico_override`), o valor digitado vence o cálculo.
 *
 * Especialidade: vem do CADASTRO DO MÉDICO. O agendamento também tem um campo
 * de especialidade, mas ele está vazio em toda a base de produção, e usá-lo
 * jogaria o relatório inteiro para "Sem especialidade".
 */
import { supabase } from "@/integrations/supabase/client";
import {
  formaDoAtendimento,
  normRepasse,
  procVariants,
  resolverRepasse,
  type RepasseConvenio,
  type RepasseMedico,
} from "@/lib/repasse-calc";
import {
  carregarMapaConvenioPacientes,
  resolverModalidade,
  type MapaConvenioPaciente,
} from "@/lib/convenio/modalidade";
import { addDias, variacao } from "@/lib/financeiro/periodos";

/** O PostgREST devolve no máximo 1.000 linhas por requisição. */
const PAGINA = 1000;
/** Guarda contra loop infinito de paginação. */
const MAX_PAGINAS = 100;

export type RateioAgruparPor = "data" | "profissional" | "especialidade";
export type RateioTipo = "sintetico" | "analitico";

/** Um atendimento já com a receita repartida entre prestador e clínica. */
export interface RateioLinha {
  id: string;
  /** Competência: dia do atendimento. */
  data: string;
  medico_id: string | null;
  medico_nome: string;
  especialidade_id: string | null;
  especialidade_nome: string;
  procedimento: string | null;
  /** Grupo de serviço do cadastro do procedimento (pode não existir). */
  grupo: string | null;
  receita: number;
  repasse: number;
  /** Parte do médico terceiro (dono do equipamento), quando houver. */
  terceiro: number;
  liquido: number;
  /**
   * Percentual da receita que ficou com a clínica NESTE atendimento. Vive na
   * linha, e não só na tela, porque a coluna "% clínica" do analítico é lida
   * por esta chave na tabela, no papel, no CSV e no Excel.
   */
  margem: number;
}

/** Uma linha do relatório sintético (um agrupador). */
export interface RateioGrupo {
  chave: string;
  rotulo: string;
  qtd: number;
  receita: number;
  repasse: number;
  liquido: number;
  /** Percentual da receita que ficou com a clínica. */
  margem: number;
}

export interface RateioTotais {
  qtd: number;
  receita: number;
  repasse: number;
  liquido: number;
  margem: number;
}

export interface RateioFiltros {
  clinicaId: string;
  de: string;
  ate: string;
  /** `null` = todos. */
  medicoId?: string | null;
  especialidadeId?: string | null;
  /** Grupo de serviço normalizado (ver `chaveGrupo`). `null` = todos. */
  grupo?: string | null;
  /** Nome do serviço como está no cadastro. `null` = todos. */
  servico?: string | null;
}

/** Médico como aparece no seletor do relatório. */
export interface MedicoOpcao {
  id: string;
  nome: string;
  especialidade_id: string | null;
}

/** Serviço como aparece no seletor do relatório. */
export interface ServicoOpcao {
  nome: string;
  /** Chave normalizada do grupo, para o seletor de serviço seguir o grupo. */
  grupo: string | null;
}

/**
 * Catálogos e grade de repasse, carregados uma única vez por clínica. Ficam
 * separados da busca do período porque os filtros da tela precisam da lista de
 * médicos/especialidades/serviços antes de qualquer "Buscar".
 */
export interface RateioContexto {
  medicos: MedicoOpcao[];
  medicosById: Map<string, MedicoOpcao>;
  especialidades: Array<{ id: string; nome: string }>;
  /** Chave normalizada -> rótulo exibido do grupo de serviço. */
  grupos: Array<{ chave: string; rotulo: string }>;
  servicos: ServicoOpcao[];
  /** nome normalizado do serviço -> chave do grupo. */
  grupoPorServico: Map<string, string>;
  /** nome normalizado do serviço -> grupo como está escrito no cadastro. */
  rotuloGrupoPorServico: Map<string, string>;
  /** nome normalizado do serviço -> tipo (fallback de repasse por categoria). */
  procTipos: Map<string, string>;
  repasseMedicos: Map<string, RepasseMedico>;
  convenioPorNome: Map<string, RepasseConvenio>;
  convenioPorNomeCru: Map<string, RepasseConvenio>;
  mapaConvenio: MapaConvenioPaciente;
}

/**
 * Chave de comparação do grupo de serviço. O cadastro tem o mesmo grupo
 * escrito de várias formas ("Oftalmologia" e "OFTALMOLOGIA"); sem normalizar,
 * o filtro deixaria metade dos serviços de fora.
 */
export const chaveGrupo = (g: string | null | undefined): string | null => {
  const bruto = String(g ?? "").trim();
  return bruto === "" ? null : normRepasse(bruto);
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (v: number) => +v.toFixed(2);

async function buscarTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar().range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

/** Carrega catálogos dos filtros + grade de repasse da clínica. */
export async function carregarContextoRateio(clinicaId: string): Promise<RateioContexto> {
  const [medicosRaw, especialidadesRaw, procedimentosRaw, repasseLista, mapaConvenio] =
    await Promise.all([
      buscarTudo<Record<string, unknown>>(() =>
        supabase
          .from("medicos")
          .select(
            "id, nome, especialidade_id, aceita_cartao_beneficios, cb_tipo_repasse, cb_valor_repasse, cb_percentual_repasse",
          )
          .eq("clinica_id", clinicaId)
          .order("nome"),
      ),
      buscarTudo<{ id: string; nome: string }>(() =>
        supabase.from("especialidades").select("id, nome").eq("ativo", true).order("nome"),
      ),
      buscarTudo<{ nome: string | null; tipo: string | null; grupo: string | null }>(() =>
        supabase
          .from("procedimentos")
          .select("nome, tipo, grupo")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
      ),
      supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaId }),
      carregarMapaConvenioPacientes(clinicaId),
    ]);

  const medicos: MedicoOpcao[] = medicosRaw.map((m) => ({
    id: m.id as string,
    nome: (m.nome as string) ?? "—",
    especialidade_id: (m.especialidade_id as string) ?? null,
  }));
  const medicosById = new Map(medicos.map((m) => [m.id, m]));

  // O repasse padrão de cada médico vem por RPC (a tabela `medicos` não expõe
  // esses campos a todos os perfis); o cartão benefícios vem do cadastro.
  const repasseMedicos = new Map<string, RepasseMedico>();
  const padroes = new Map<
    string,
    {
      tipo_repasse: string | null;
      percentual_repasse_padrao: number | null;
      valor_repasse_padrao: number | null;
    }
  >();
  for (const r of ((repasseLista.data as unknown[] | null) ?? []) as Array<{
    id: string;
    tipo_repasse: string | null;
    percentual_repasse_padrao: number | null;
    valor_repasse_padrao: number | null;
  }>) {
    padroes.set(r.id, r);
  }
  for (const m of medicosRaw) {
    const id = m.id as string;
    const p = padroes.get(id);
    repasseMedicos.set(id, {
      id,
      tipo_repasse: p?.tipo_repasse ?? "percentual",
      percentual_repasse_padrao: Number(p?.percentual_repasse_padrao ?? 0),
      valor_repasse_padrao: p?.valor_repasse_padrao ?? null,
      aceita_cartao_beneficios: !!m.aceita_cartao_beneficios,
      cb_tipo_repasse: (m.cb_tipo_repasse as string) ?? null,
      cb_valor_repasse: (m.cb_valor_repasse as number) ?? null,
      cb_percentual_repasse: (m.cb_percentual_repasse as number) ?? null,
    });
  }

  const convenios = await buscarTudo<RepasseConvenio>(() =>
    supabase
      .from("medico_convenios")
      .select(
        "medico_id, nome, tipo_repasse, percentual, valor, convenio_tipo_repasse, convenio_percentual, convenio_valor, cartao_consulta_valor, cartao_desconto_valor, terceiro_id, percentual_terceiro",
      )
      .eq("ativo", true)
      .order("medico_id"),
  );
  // Índices O(1): o cálculo roda uma vez por atendimento do período e a base
  // tem milhares de linhas de convênio — busca linear travaria a tela.
  const convenioPorNome = new Map<string, RepasseConvenio>();
  const convenioPorNomeCru = new Map<string, RepasseConvenio>();
  for (const cv of convenios) {
    const kNorm = `${cv.medico_id}|${normRepasse(cv.nome)}`;
    if (!convenioPorNome.has(kNorm)) convenioPorNome.set(kNorm, cv);
    const kCru = `${cv.medico_id}|${cv.nome}`;
    if (!convenioPorNomeCru.has(kCru)) convenioPorNomeCru.set(kCru, cv);
  }

  const procTipos = new Map<string, string>();
  const grupoPorServico = new Map<string, string>();
  const rotuloGrupoPorServico = new Map<string, string>();
  const gruposMap = new Map<string, string>();
  const servicos: ServicoOpcao[] = [];
  const vistos = new Set<string>();
  for (const p of procedimentosRaw) {
    if (!p.nome) continue;
    const chave = normRepasse(p.nome);
    if (p.tipo && !procTipos.has(chave)) procTipos.set(chave, p.tipo);
    const g = chaveGrupo(p.grupo);
    if (g) {
      if (!grupoPorServico.has(chave)) grupoPorServico.set(chave, g);
      if (!rotuloGrupoPorServico.has(chave)) rotuloGrupoPorServico.set(chave, String(p.grupo));
      // O rótulo do grupo sai em caixa alta porque a mesma palavra aparece
      // escrita de jeitos diferentes e o seletor mostraria a lista duplicada.
      if (!gruposMap.has(g)) gruposMap.set(g, String(p.grupo).toUpperCase());
    }
    if (!vistos.has(chave)) {
      vistos.add(chave);
      servicos.push({ nome: p.nome, grupo: g });
    }
  }

  return {
    medicos,
    medicosById,
    especialidades: especialidadesRaw,
    grupos: Array.from(gruposMap, ([chave, rotulo]) => ({ chave, rotulo })).sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    ),
    servicos,
    grupoPorServico,
    rotuloGrupoPorServico,
    procTipos,
    repasseMedicos,
    convenioPorNome,
    convenioPorNomeCru,
    mapaConvenio,
  };
}

/** Acha a linha da grade de repasse do serviço (ou da categoria dele). */
function linhaDoServico(
  ctx: RateioContexto,
  medicoId: string,
  procNome: string | null,
): RepasseConvenio | undefined {
  if (!procNome) return undefined;
  const variantes = procVariants(procNome);
  for (const alvo of variantes) {
    const achou = ctx.convenioPorNome.get(`${medicoId}|${alvo}`);
    if (achou) return achou;
  }
  for (const alvo of variantes) {
    const tipo = ctx.procTipos.get(alvo);
    if (!tipo) continue;
    const sentinela = `__CAT__:${String(tipo).toUpperCase()}`;
    const achou = ctx.convenioPorNomeCru.get(`${medicoId}|${sentinela}`);
    if (achou) return achou;
  }
  return undefined;
}

function reparte(
  ctx: RateioContexto,
  params: {
    id: string;
    data: string;
    medicoId: string | null;
    pacienteId: string | null;
    procedimento: string | null;
    valorPago: number;
    descricao?: string | null;
    modalidadeLancamento?: string | null;
    /** Repasse digitado à mão na tela de Atendimentos, se houver. */
    override?: number | null;
    /** Repasse já gravado na linha (atendimentos manuais antigos). */
    repasseGravado?: number | null;
  },
): RateioLinha {
  const medico = params.medicoId ? (ctx.medicosById.get(params.medicoId) ?? null) : null;
  const modalidade = resolverModalidade({
    modalidadeLancamento: params.modalidadeLancamento ?? null,
    pacienteId: params.pacienteId,
    mapa: ctx.mapaConvenio,
  });
  const linha = params.medicoId
    ? linhaDoServico(ctx, params.medicoId, params.procedimento)
    : undefined;
  const calc = params.medicoId
    ? resolverRepasse({
        linha,
        med: ctx.repasseMedicos.get(params.medicoId) ?? null,
        base: params.valorPago,
        forma: formaDoAtendimento(params.descricao ?? null, modalidade),
      })
    : { total: params.valorPago, repasse: 0, terceiro: null };

  const receita = calc.total > 0 ? calc.total : params.valorPago;
  const repasseCalculado = calc.repasse > 0 ? calc.repasse : num(params.repasseGravado ?? 0);
  const repasse =
    params.override !== null && params.override !== undefined && Number.isFinite(params.override)
      ? params.override
      : repasseCalculado;
  const terceiro = calc.terceiro?.valor ?? 0;
  const liquido = round2(receita - repasse - terceiro);
  return {
    id: params.id,
    data: params.data,
    medico_id: params.medicoId,
    medico_nome: medico?.nome ?? "Sem profissional",
    especialidade_id: medico?.especialidade_id ?? null,
    especialidade_nome: "",
    procedimento: params.procedimento,
    grupo: params.procedimento
      ? (ctx.rotuloGrupoPorServico.get(normRepasse(params.procedimento)) ?? null)
      : null,
    receita: round2(receita),
    repasse: round2(repasse),
    terceiro: round2(terceiro),
    liquido,
    margem: margemClinica(receita, liquido),
  };
}

/** Busca os atendimentos do período e devolve cada um já rateado. */
export async function carregarRateio(
  ctx: RateioContexto,
  filtros: RateioFiltros,
): Promise<RateioLinha[]> {
  const { clinicaId, de, ate } = filtros;

  const [manuaisRaw, agendaRaw] = await Promise.all([
    buscarTudo<Record<string, unknown>>(() =>
      supabase
        .from("fin_atendimentos")
        .select(
          "id, data, procedimento, valor_total, valor_medico, medico_id, paciente_id, lancamento_id",
        )
        .eq("clinica_id", clinicaId)
        .gte("data", de)
        .lte("data", ate)
        .order("data"),
    ),
    buscarTudo<Record<string, unknown>>(() =>
      supabase
        .from("fin_lancamentos")
        .select(
          "id, data, descricao, valor, valor_medico_override, convenio_modalidade, medico_id, paciente_id, agendamento_id, agendamento:agendamentos!inner(procedimento, medico_id, paciente_id, inicio)",
        )
        .eq("clinica_id", clinicaId)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
        .not("agendamento_id", "is", null)
        .gte("agendamento.inicio", `${de}T00:00:00`)
        .lte("agendamento.inicio", `${ate}T23:59:59.999`)
        .order("data"),
    ),
  ]);

  // Um atendimento manual criado a partir de um pagamento da agenda espelha o
  // mesmo dinheiro do lançamento — contar os dois dobraria a receita.
  const lancIds = new Set(agendaRaw.map((r) => r.id as string));
  const idsEspelho = manuaisRaw
    .map((r) => (r.lancamento_id as string | null) ?? null)
    .filter((x): x is string => !!x);
  const espelhosDaAgenda = new Set<string>();
  for (let i = 0; i < idsEspelho.length; i += PAGINA) {
    const { data } = await supabase
      .from("fin_lancamentos")
      .select("id, agendamento_id")
      .in("id", idsEspelho.slice(i, i + PAGINA))
      .not("agendamento_id", "is", null);
    for (const e of (data ?? []) as Array<{ id: string }>) espelhosDaAgenda.add(e.id);
  }

  const linhas: RateioLinha[] = [];
  for (const r of manuaisRaw) {
    const lancId = (r.lancamento_id as string | null) ?? null;
    if (lancId && (lancIds.has(lancId) || espelhosDaAgenda.has(lancId))) continue;
    linhas.push(
      reparte(ctx, {
        id: r.id as string,
        data: String(r.data ?? "").slice(0, 10),
        medicoId: (r.medico_id as string) ?? null,
        pacienteId: (r.paciente_id as string) ?? null,
        procedimento: (r.procedimento as string) ?? null,
        valorPago: num(r.valor_total),
        repasseGravado: num(r.valor_medico),
      }),
    );
  }
  for (const r of agendaRaw) {
    const ag = (r.agendamento ?? null) as {
      procedimento?: string | null;
      medico_id?: string | null;
      paciente_id?: string | null;
      inicio?: string | null;
    } | null;
    const overrideRaw = r.valor_medico_override;
    const override =
      overrideRaw !== null && overrideRaw !== undefined && overrideRaw !== ""
        ? Number(overrideRaw)
        : null;
    linhas.push(
      reparte(ctx, {
        id: r.id as string,
        // Competência do rateio: o dia marcado na agenda.
        data: ag?.inicio ? ag.inicio.slice(0, 10) : String(r.data ?? "").slice(0, 10),
        medicoId: (r.medico_id as string) ?? ag?.medico_id ?? null,
        pacienteId: (r.paciente_id as string) ?? ag?.paciente_id ?? null,
        procedimento: ag?.procedimento ?? null,
        valorPago: num(r.valor),
        descricao: (r.descricao as string) ?? null,
        modalidadeLancamento: (r.convenio_modalidade as string) ?? null,
        override,
      }),
    );
  }

  // O nome da especialidade é resolvido no fim, para o rótulo já sair pronto
  // na tabela, no papel e no CSV.
  const nomeEspecialidade = new Map(ctx.especialidades.map((e) => [e.id, e.nome]));
  for (const l of linhas) {
    l.especialidade_nome = l.especialidade_id
      ? (nomeEspecialidade.get(l.especialidade_id) ?? "Sem especialidade")
      : "Sem especialidade";
  }

  return filtrarRateio(ctx, linhas, filtros).sort(
    (a, b) => a.data.localeCompare(b.data) || a.medico_nome.localeCompare(b.medico_nome, "pt-BR"),
  );
}

/** Aplica os filtros que não dá para mandar ao banco (serviço é texto livre). */
export function filtrarRateio(
  ctx: RateioContexto,
  linhas: RateioLinha[],
  filtros: RateioFiltros,
): RateioLinha[] {
  const servicoAlvo = filtros.servico ? normRepasse(filtros.servico) : null;
  const grupoAlvo = filtros.grupo ?? null;
  return linhas.filter((l) => {
    if (filtros.medicoId && l.medico_id !== filtros.medicoId) return false;
    if (filtros.especialidadeId && l.especialidade_id !== filtros.especialidadeId) return false;
    if (servicoAlvo || grupoAlvo) {
      const chave = l.procedimento ? normRepasse(l.procedimento) : null;
      // Atendimento sem serviço identificado não pertence a grupo nenhum.
      if (!chave) return false;
      if (servicoAlvo && chave !== servicoAlvo) return false;
      if (grupoAlvo && ctx.grupoPorServico.get(chave) !== grupoAlvo) return false;
    }
    return true;
  });
}

/** Percentual da receita que ficou com a clínica (0 quando não houve receita). */
export const margemClinica = (receita: number, liquido: number): number =>
  receita === 0 ? 0 : round2((liquido / receita) * 100);

/** Consolida as linhas no agrupador escolhido (relatório sintético). */
export function agruparRateio(linhas: RateioLinha[], agruparPor: RateioAgruparPor): RateioGrupo[] {
  const acc = new Map<string, RateioGrupo>();
  for (const l of linhas) {
    const chave =
      agruparPor === "data"
        ? l.data
        : agruparPor === "profissional"
          ? (l.medico_id ?? "sem-profissional")
          : (l.especialidade_id ?? "sem-especialidade");
    const rotulo =
      agruparPor === "data"
        ? l.data
        : agruparPor === "profissional"
          ? l.medico_nome
          : l.especialidade_nome;
    const atual = acc.get(chave) ?? {
      chave,
      rotulo,
      qtd: 0,
      receita: 0,
      repasse: 0,
      liquido: 0,
      margem: 0,
    };
    atual.qtd += 1;
    atual.receita = round2(atual.receita + l.receita);
    atual.repasse = round2(atual.repasse + l.repasse);
    // O líquido já vem descontado da parte do terceiro, quando existe.
    atual.liquido = round2(atual.liquido + l.liquido);
    acc.set(chave, atual);
  }
  const grupos = Array.from(acc.values());
  for (const g of grupos) g.margem = margemClinica(g.receita, g.liquido);
  return grupos.sort((a, b) =>
    agruparPor === "data"
      ? a.rotulo.localeCompare(b.rotulo)
      : a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

/** Uma linha do sintético já confrontada com o período de comparação. */
export interface RateioGrupoComparado extends RateioGrupo {
  /** Receita do mesmo agrupador no período de comparação. */
  receitaAnterior: number;
  /** Diferença em reais (positiva = subiu). */
  variacaoValor: number;
  /** Diferença em %. `null` quando não havia base (período anterior zerado). */
  variacaoPercentual: number | null;
  /** Verdadeiro quando o agrupador só existe no período de comparação. */
  somenteAnterior: boolean;
}

/**
 * Confronta o sintético dos dois períodos.
 *
 * Agrupado por profissional ou especialidade o par é óbvio (mesmo médico,
 * mesma especialidade). Agrupado por DATA os dias nunca coincidem — os
 * períodos são outros —, então cada dia é comparado com o dia de mesma
 * POSIÇÃO no período de comparação: o 1º dia com o 1º dia, o 2º com o 2º.
 * `deslocamentoDias` é a distância entre os dois inícios.
 *
 * Agrupador que aparece só no período de comparação entra na lista com receita
 * zero e queda de 100%: um prestador que faturava e parou é exatamente o que a
 * gestão quer enxergar num comparativo.
 */
export function compararRateio(
  atuais: RateioGrupo[],
  anteriores: RateioGrupo[],
  agruparPor: RateioAgruparPor,
  deslocamentoDias: number,
): RateioGrupoComparado[] {
  const chaveAnterior = (g: RateioGrupo) =>
    agruparPor === "data" ? addDias(g.chave, deslocamentoDias) : g.chave;
  const porChave = new Map<string, RateioGrupo>();
  for (const g of anteriores) porChave.set(chaveAnterior(g), g);

  const saida: RateioGrupoComparado[] = atuais.map((g) => {
    const par = porChave.get(g.chave);
    porChave.delete(g.chave);
    const v = variacao(g.receita, par?.receita ?? 0);
    return {
      ...g,
      receitaAnterior: par?.receita ?? 0,
      variacaoValor: v.valor,
      variacaoPercentual: v.percentual,
      somenteAnterior: false,
    };
  });
  for (const [chave, g] of porChave) {
    const v = variacao(0, g.receita);
    saida.push({
      chave,
      // Na comparação por data o rótulo é o dia equivalente do período atual.
      rotulo: agruparPor === "data" ? chave : g.rotulo,
      qtd: 0,
      receita: 0,
      repasse: 0,
      liquido: 0,
      margem: 0,
      receitaAnterior: g.receita,
      variacaoValor: v.valor,
      variacaoPercentual: v.percentual,
      somenteAnterior: true,
    });
  }
  return saida.sort((a, b) =>
    agruparPor === "data"
      ? a.rotulo.localeCompare(b.rotulo)
      : a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

/** Totais gerais do período — sempre do período inteiro, nunca da página. */
export function totaisRateio(linhas: RateioLinha[]): RateioTotais {
  let receita = 0;
  let repasse = 0;
  let liquido = 0;
  for (const l of linhas) {
    receita += l.receita;
    repasse += l.repasse;
    liquido += l.liquido;
  }
  receita = round2(receita);
  repasse = round2(repasse);
  liquido = round2(liquido);
  return { qtd: linhas.length, receita, repasse, liquido, margem: margemClinica(receita, liquido) };
}
