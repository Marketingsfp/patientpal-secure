/**
 * FONTE OPERACIONAL DA NINA (30/09/2026) — regras puras.
 *
 * A Nina deixa de ler a base de conhecimentos (catálogo editorial `nina_cat_*`) e passa a ler o
 * próprio cadastro do sistema: médicos, agendas e horários (aba "Horários médicos") e
 * procedimentos (valores). Este módulo só CONVERTE os registros do cadastro para os mesmos
 * formatos que as ferramentas da Nina já consomem (`ProfissionalPublicado`/`ServicoPublicado`).
 *
 * Regra de ouro (decisão do usuário): NÃO corrigir o cadastro. Duplicado, campo vazio ou erro
 * passam como estão, até a equipe corrigir na origem. O único filtro é o que já era regra:
 *  - médico inativo ou marcado como NÃO visível no agendamento online não é informado;
 *  - consulta só é informada quando tem algum valor maior que zero (valor zero = não informado);
 *  - horário fora da vigência não é informado.
 *
 * Campo vazio = desconhecido: nunca vira "R$ 0", "não atende" ou dia fechado.
 */
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";
import { paraNumero } from "./catalogo";
import { profissionalSfp } from "./regras-catalogo";

export type MedicoOp = {
  id: string;
  nome: string;
  especialidade_id: string | null;
  visivel_agendamento_online?: boolean | null;
};
export type DisponibilidadeOp = {
  medico_id: string;
  agenda_id?: string | null;
  dia_semana: number;
  hora_inicio: string | null;
  hora_fim: string | null;
  observacoes?: string | null;
  limite_pacientes?: number | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
};
export type AgendaOp = {
  id: string;
  medico_id: string;
  nome: string;
  ordem_chegada?: boolean | null;
};
export type ProcedimentoOp = {
  id: string;
  nome: string;
  tipo: string | null;
  valor_padrao?: unknown;
  valor_dinheiro_pix?: unknown;
  valor_dinheiro?: unknown;
  valor_cartao?: unknown;
  preparo?: string | null;
};
export type VinculoOp = {
  medico_id: string;
  procedimento_id: string;
  especialidade_id?: string | null;
};
export type EspecialidadeOp = { id: string; nome: string };

export type EntradaOperacional = {
  medicos: readonly MedicoOp[];
  disponibilidades: readonly DisponibilidadeOp[];
  agendas: readonly AgendaOp[];
  procedimentos: readonly ProcedimentoOp[];
  vinculos: readonly VinculoOp[];
  especialidades: readonly EspecialidadeOp[];
  /** Data de hoje (AAAA-MM-DD, horário da clínica) para a vigência dos horários. */
  hojeISO: string;
};

export type ProfissionalOperacional = ProfissionalPublicado & { medico_id: string | null };

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const SEM_ESPECIALIDADE = "não informada no cadastro";

const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);
const limpo = (v: string | null | undefined) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};
const reais = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const maior0 = (v: unknown): number | null => {
  const n = paraNumero(v);
  return n !== null && n > 0 ? n : null;
};

/**
 * Preços do cadastro. Dinheiro = o primeiro valor maior que zero entre dinheiro/PIX, dinheiro e
 * padrão; cartão = só o valor de cartão cadastrado (nunca inventado). Zero = não informado.
 */
export function precosDoProcedimento(p: ProcedimentoOp): { dinheiro: number | null; cartao: number | null } {
  return {
    dinheiro: maior0(p.valor_dinheiro_pix) ?? maior0(p.valor_dinheiro) ?? maior0(p.valor_padrao),
    cartao: maior0(p.valor_cartao),
  };
}

export function temValor(p: ProcedimentoOp): boolean {
  const { dinheiro, cartao } = precosDoProcedimento(p);
  return dinheiro !== null || cartao !== null;
}

function formas(p: ProcedimentoOp, condicao: string | null) {
  const { dinheiro, cartao } = precosDoProcedimento(p);
  return [
    ...(dinheiro !== null ? [{ condicao, forma: "Dinheiro", observacao: null, valor: dinheiro }] : []),
    // O código da Nina apresenta "Cartão" como Pix/cartão (regra da clínica: Pix = cartão).
    ...(cartao !== null ? [{ condicao, forma: "Cartão", observacao: null, valor: cartao }] : []),
  ];
}

type Horario = { dia: string; inicio: string | null; fim: string | null; recorrencia: string; observacao: string | null };

function vigente(d: DisponibilidadeOp, hojeISO: string): boolean {
  if (d.vigencia_inicio && d.vigencia_inicio > hojeISO) return false;
  if (d.vigencia_fim && d.vigencia_fim < hojeISO) return false;
  return true;
}

/** Horários do médico, do jeito que estão na aba (repetidos e sobrepostos passam). */
export function horariosDoMedico(
  medicoId: string,
  e: Pick<EntradaOperacional, "disponibilidades" | "agendas" | "hojeISO">,
): Horario[] {
  const agendasDoMedico = e.agendas.filter((a) => a.medico_id === medicoId);
  const porAgenda = new Map(agendasDoMedico.map((a) => [a.id, a]));
  const mostrarAgenda = agendasDoMedico.length > 1;
  return e.disponibilidades
    .filter((d) => d.medico_id === medicoId && vigente(d, e.hojeISO))
    .sort((a, b) => a.dia_semana - b.dia_semana || String(a.hora_inicio ?? "").localeCompare(String(b.hora_inicio ?? "")))
    .map((d) => {
      const agenda = d.agenda_id ? porAgenda.get(d.agenda_id) : undefined;
      const partes = [
        limpo(d.observacoes),
        d.limite_pacientes !== null && d.limite_pacientes !== undefined
          ? `Limite de ${d.limite_pacientes} paciente${d.limite_pacientes === 1 ? "" : "s"}`
          : null,
        mostrarAgenda && agenda ? `Agenda: ${agenda.nome}${agenda.ordem_chegada ? " (ordem de chegada)" : ""}` : null,
      ].filter(Boolean);
      return {
        dia: DIAS[d.dia_semana] ?? `Dia ${d.dia_semana}`,
        inicio: hhmm(d.hora_inicio),
        fim: hhmm(d.hora_fim),
        recorrencia: "Toda semana",
        observacao: partes.length ? partes.join(" · ") : null,
      };
    });
}

function resumoDosHorarios(h: Horario[]): string {
  if (!h.length) return "não informado no cadastro";
  return h
    .map((x) => `${x.dia}${x.inicio ? (x.fim ? ` ${x.inicio}–${x.fim}` : ` a partir de ${x.inicio}`) : ""}`)
    .join(" · ");
}

/** Modalidade pelas agendas do médico: todas em ordem de chegada → ordem de chegada; nenhuma → hora marcada. */
export function tipoAtendimentoDoMedico(agendas: readonly AgendaOp[]): string | null {
  if (!agendas.length) return null;
  const chegada = agendas.filter((a) => a.ordem_chegada === true).length;
  if (chegada === agendas.length) return "Ordem de chegada";
  return chegada === 0 ? "Hora marcada" : null;
}

function bloco(args: {
  atendimento: string;
  especialidade: string | null;
  profissional: string;
  horarios: string;
  preco: { dinheiro: number | null; cartao: number | null };
}): string {
  return [
    args.atendimento,
    `Especialidade: ${args.especialidade ?? SEM_ESPECIALIDADE}`,
    `Profissional: ${args.profissional}`,
    `Dias e horários: ${args.horarios}`,
    ...(args.preco.dinheiro !== null ? [`Dinheiro: ${reais(args.preco.dinheiro)}`] : []),
    ...(args.preco.cartao !== null ? [`Cartão: ${reais(args.preco.cartao)}`] : []),
  ].join("\n");
}

const nomeDe = (mapa: Map<string, string>, id: string | null | undefined) => (id ? (mapa.get(id) ?? null) : null);

/** Consultas primeiro pelo nome exato "CONSULTA"; o resto em ordem alfabética. */
function ordemConsultas(a: ProcedimentoOp, b: ProcedimentoOp): number {
  const pa = /^consulta$/i.test(a.nome.trim()) ? 0 : 1;
  const pb = /^consulta$/i.test(b.nome.trim()) ? 0 : 1;
  return pa - pb || a.nome.localeCompare(b.nome, "pt-BR");
}

export function visivelAoPaciente(m: MedicoOp): boolean {
  return m.visivel_agendamento_online !== false;
}

/** Médicos do cadastro → profissionais no formato da Nina (um por médico, sem deduplicar). */
export function mapearProfissionais(e: EntradaOperacional): ProfissionalOperacional[] {
  const nomesEsp = new Map(e.especialidades.map((x) => [x.id, x.nome]));
  const proc = new Map(e.procedimentos.map((p) => [p.id, p]));
  return e.medicos.filter(visivelAoPaciente).map((m) => {
    const agendas = e.agendas.filter((a) => a.medico_id === m.id);
    const horarios = horariosDoMedico(m.id, e);
    const vinculos = e.vinculos.filter((v) => v.medico_id === m.id);
    const consultas = vinculos
      .map((v) => ({ v, p: proc.get(v.procedimento_id) }))
      .filter((x): x is { v: VinculoOp; p: ProcedimentoOp } => !!x.p && x.p.tipo === "consulta" && temValor(x.p))
      .sort((a, b) => ordemConsultas(a.p, b.p));

    const idsEsp = [
      ...new Set([m.especialidade_id, ...vinculos.map((v) => v.especialidade_id ?? null)].filter((x): x is string => !!x)),
    ];
    const especialidades = idsEsp
      .map((id) => ({ id, nome: nomeDe(nomesEsp, id) }))
      .filter((x): x is { id: string; nome: string } => !!x.nome);
    const espPadrao = nomeDe(nomesEsp, m.especialidade_id);
    const resumo = resumoDosHorarios(horarios);

    return {
      id: m.id,
      medico_id: m.id,
      nome: m.nome,
      especialidades,
      atende_consultorio: null,
      convenios: [],
      horarios,
      tipo_atendimento: tipoAtendimentoDoMedico(agendas),
      formas_pagamento: consultas.flatMap(({ p }) => formas(p, p.nome)),
      observacao_publica: consultas.length
        ? consultas
            .map(({ v, p }) =>
              bloco({
                atendimento: p.nome,
                especialidade: nomeDe(nomesEsp, v.especialidade_id) ?? espPadrao,
                profissional: m.nome,
                horarios: resumo,
                preco: precosDoProcedimento(p),
              }),
            )
            .join("\n\n")
        : null,
      aviso_dia: null,
      aviso_valido_de: null,
      aviso_valido_ate: null,
      unidades: null,
      estrutura: { versao: 1, categoria: "consulta", aliases: [], complementos: [] },
    };
  });
}

/** Procedimentos/exames do cadastro → serviços no formato da Nina (um por cadastro, sem deduplicar). */
export function mapearServicos(e: EntradaOperacional): ServicoPublicado[] {
  const nomesEsp = new Map(e.especialidades.map((x) => [x.id, x.nome]));
  const medicos = new Map(e.medicos.filter(visivelAoPaciente).map((m) => [m.id, m]));
  const vinculosPorProc = new Map<string, VinculoOp[]>();
  for (const v of e.vinculos) {
    if (!medicos.has(v.medico_id)) continue;
    const lista = vinculosPorProc.get(v.procedimento_id) ?? [];
    lista.push(v);
    vinculosPorProc.set(v.procedimento_id, lista);
  }
  const resumoPorMedico = new Map<string, string>();
  const resumoDe = (medicoId: string) => {
    let r = resumoPorMedico.get(medicoId);
    if (r === undefined) {
      r = resumoDosHorarios(horariosDoMedico(medicoId, e));
      resumoPorMedico.set(medicoId, r);
    }
    return r;
  };
  // Profissional-ponte "SAO FRANCISCO DE PAULA" (oculto do agendamento online).
  // Item cujo ÚNICO executante é ele é feito na unidade São Francisco de Paula:
  // entra no cadastro da Maria só com o nome do item e o executante, sem valor,
  // horário nem descrição, marcado para encaminhamento (decisão de 02/10/2026).
  // Item que também tem profissional visível desta clínica segue normal.
  const idsSfp = new Set(e.medicos.filter((m) => profissionalSfp(m.nome)).map((m) => m.id));
  const executantesTodos = new Map<string, string[]>();
  for (const v of e.vinculos) {
    const lista = executantesTodos.get(v.procedimento_id) ?? [];
    lista.push(v.medico_id);
    executantesTodos.set(v.procedimento_id, lista);
  }
  const soSfp = (procId: string) => {
    const ids = executantesTodos.get(procId) ?? [];
    return ids.length > 0 && !(vinculosPorProc.get(procId)?.length) && ids.every((id) => idsSfp.has(id));
  };
  return e.procedimentos
    .filter((p) => p.tipo !== "consulta")
    .map((p): ServicoPublicado => {
      if (soSfp(p.id)) {
        const sfp = e.medicos.find((m) => idsSfp.has(m.id));
        return {
          id: p.id,
          procedimento_id: p.id,
          nome: p.nome,
          valor: null,
          valor_observacao: null,
          descricao_publica: null,
          preparo: null,
          restricoes: null,
          executantes: [{ nome: sfp?.nome ?? "SAO FRANCISCO DE PAULA", medico_id: null, horarios: null, observacao: null }],
          formas_pagamento: [],
          estrutura: {
            versao: 1, categoria: "exame_procedimento", aliases: [], complementos: [],
            encaminhamento_humano: true,
          },
        } as ServicoPublicado;
      }
      const preco = precosDoProcedimento(p);
      const executantes = (vinculosPorProc.get(p.id) ?? []).map((v) => ({ v, m: medicos.get(v.medico_id)! }));
      return {
        id: p.id,
        procedimento_id: p.id,
        nome: p.nome,
        valor: preco.dinheiro ?? preco.cartao,
        valor_observacao: null,
        descricao_publica: executantes.length
          ? executantes
              .map(({ v, m }) =>
                bloco({
                  atendimento: p.nome,
                  especialidade: nomeDe(nomesEsp, v.especialidade_id) ?? nomeDe(nomesEsp, m.especialidade_id),
                  profissional: m.nome,
                  horarios: resumoDe(m.id),
                  preco,
                }),
              )
              .join("\n\n")
          : null,
        preparo: limpo(p.preparo),
        restricoes: null,
        executantes: executantes.map(({ m }) => ({
          nome: m.nome,
          medico_id: m.id,
          horarios: resumoDe(m.id),
          observacao: null,
        })),
        formas_pagamento: formas(p, null),
        estrutura: { versao: 1, categoria: "exame_procedimento", aliases: [], complementos: [] },
      };
    });
}
