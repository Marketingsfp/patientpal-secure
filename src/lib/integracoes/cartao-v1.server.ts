// Recursos do Cartão Benefícios na API de integração v1 — SOMENTE LEITURA.
//
// GENÉRICA por decisão de projeto, igual ao módulo de agendamentos: não existe
// aqui nenhum parceiro, webhook ou formato de sistema externo. É o cartão do
// Health Hub Pro exposto como REST, com chave de API e escopo.
//
// Nenhuma função deste arquivo escreve no banco. Não há INSERT, UPDATE nem
// DELETE — a primeira escrita da integração é assunto de outra etapa.
//
// Duas decisões que valem por todo o arquivo:
//
// 1. A régua de inadimplência é recalculada AQUI, reaproveitando
//    `classificarParcela` de `@/lib/cb-regras` — a mesma que a Agenda, o Caixa
//    e a tela de Vendas usam. As funções `paciente_cartao_status` e
//    `paciente_cartao_inadimplente` do banco fariam o mesmo cálculo, mas são
//    SECURITY DEFINER e validam `auth.uid()` contra `clinica_memberships`:
//    esta API roda com service role, sem usuário logado, então elas
//    levantariam "Sem acesso a esta clínica.". Chamá-las daqui não funciona.
//
// 2. O consumidor externo nunca vê `status` cru sem tradução. Existem parcelas
//    legadas com status 'aberto' convivendo com 'pendente' (e o banco também
//    aceita 'atrasado'/'vencida'/'vencido'), o que faria um sistema externo
//    classificar errado quem está em dia. O campo `situacao` normaliza tudo em
//    quatro baldes que somam o total sem sobra nem repetição.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ApiError, exigirEscopo, type ApiKeyContexto } from "./api.server";
import {
  DIAS_TOLERANCIA_MENSALIDADE,
  classificarParcela,
  type SituacaoParcela,
} from "@/lib/cb-regras";

type Db = SupabaseClient<Database>;

/**
 * Status que significam "parcela ainda em aberto".
 *
 * Mesma lista usada por `paciente_cartao_inadimplente` no banco. Produção tem
 * hoje 'pendente' e 'aberto'; os outros três existem em dados antigos e ficam
 * aqui para a API nunca tratar um deles como quitado por engano.
 */
const STATUS_EM_ABERTO = ["pendente", "aberto", "atrasado", "vencida", "vencido"] as const;

// ------------------------------------------------------------------- helpers

const uuid = z.string().uuid("Identificador inválido.");
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");
const dataHoraIso = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Data/hora inválida (use ISO 8601).");

function ok<T>(status: number, data: T) {
  return { status, body: { data } };
}

/**
 * Hoje no fuso de São Paulo, "AAAA-MM-DD".
 *
 * O Worker roda em UTC: `new Date().toISOString()` já devolve a data de amanhã
 * a partir das ~21h no Brasil, o que adiantaria em um dia a contagem de atraso
 * e marcaria como inadimplente quem ainda está na tolerância. É o mesmo fuso
 * que `paciente_cartao_inadimplente` usa no banco.
 */
export function hojeSaoPauloISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Datas comparadas como texto/UTC de propósito — ver comentário em `cb-regras`. */
function diasAtraso(vencimentoIso: string, hojeIso: string): number {
  const venc = Date.parse(`${vencimentoIso.slice(0, 10)}T00:00:00Z`);
  const hoje = Date.parse(`${hojeIso}T00:00:00Z`);
  if (Number.isNaN(venc) || Number.isNaN(hoje)) return 0;
  return Math.max(0, Math.round((hoje - venc) / 86_400_000));
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Só dígitos, ou null. Nunca completa nem inventa um CPF ausente. */
function cpfDigitos(cpf: string | null | undefined): string | null {
  const so = (cpf ?? "").replace(/\D/g, "");
  return so.length === 11 ? so : null;
}

/**
 * Percorre uma consulta paginada até o fim.
 *
 * O PostgREST devolve no máximo 1.000 linhas por chamada. Sem isto, um contrato
 * a partir da milésima parcela da página sairia com resumo financeiro
 * incompleto — e resumo incompleto vira cobrança errada do outro lado.
 */
async function lerTudoPaginado<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000;
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao ler." });
    const linhas = data ?? [];
    tudo.push(...linhas);
    if (linhas.length < PAGINA) return tudo;
  }
}

/**
 * Quebra uma lista de ids em blocos para o filtro `.in(...)`.
 *
 * O filtro vai na URL de um GET: 1.188 UUIDs de uma vez passariam de 40 KB e a
 * requisição seria recusada antes de chegar ao banco.
 */
function emBlocos<T>(itens: T[], tamanho = 100): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

// -------------------------------------------------------- regra de situação

export type ParcelaBruta = {
  id: string;
  contrato_id: string;
  numero_parcela: number;
  vencimento: string;
  valor: number | null;
  taxa_adesao: number | null;
  status: string;
  pago_em: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
  multa: number | null;
  juros: number | null;
  updated_at: string;
};

export function serializarParcela(m: ParcelaBruta, hojeIso: string) {
  const situacao: SituacaoParcela = classificarParcela(m.status, m.vencimento, hojeIso);
  const emAberto = situacao === "a_vencer" || situacao === "inadimplente";
  return {
    id: m.id,
    numero_parcela: m.numero_parcela,
    vencimento: m.vencimento,
    valor: round2(num(m.valor)),
    taxa_adesao: round2(num(m.taxa_adesao)),
    situacao,
    status: m.status,
    dias_atraso: emAberto ? diasAtraso(m.vencimento, hojeIso) : 0,
    pago_em: m.pago_em,
    valor_pago: m.valor_pago == null ? null : round2(num(m.valor_pago)),
    forma_pagamento: m.forma_pagamento,
    multa: round2(num(m.multa)),
    juros: round2(num(m.juros)),
    updated_at: m.updated_at,
  };
}

type SituacaoFinanceira = "em_dia" | "em_carencia" | "inadimplente";

/**
 * Consolida as parcelas de UM contrato.
 *
 * `em_carencia` não é inadimplência: é parcela vencida há até
 * DIAS_TOLERANCIA_MENSALIDADE dias, e nela o cartão funciona normalmente no
 * balcão. Sai como estado próprio justamente para o consumidor externo não
 * juntar os dois e bloquear quem a clínica atende sem problema.
 */
export function resumirContrato(parcelas: ParcelaBruta[], hojeIso: string) {
  let pagas = 0;
  let aVencer = 0;
  let inadimplentes = 0;
  let canceladas = 0;
  let totalVencidoEmAberto = 0;
  let totalEmCarencia = 0;
  let diasCarenciaRestantes: number | null = null;

  for (const m of parcelas) {
    const situacao = classificarParcela(m.status, m.vencimento, hojeIso);
    if (situacao === "paga") pagas += 1;
    else if (situacao === "cancelada") canceladas += 1;
    else if (situacao === "inadimplente") {
      inadimplentes += 1;
      totalVencidoEmAberto += num(m.valor);
    } else {
      aVencer += 1;
      // Vencida mas ainda dentro da tolerância: conta como carência.
      const atraso = diasAtraso(m.vencimento, hojeIso);
      if (atraso > 0) {
        totalEmCarencia += num(m.valor);
        const restantes = DIAS_TOLERANCIA_MENSALIDADE - atraso;
        diasCarenciaRestantes =
          diasCarenciaRestantes == null ? restantes : Math.min(diasCarenciaRestantes, restantes);
      }
    }
  }

  const situacao_financeira: SituacaoFinanceira =
    inadimplentes > 0 ? "inadimplente" : totalEmCarencia > 0 ? "em_carencia" : "em_dia";

  return {
    situacao_financeira,
    resumo_financeiro: {
      parcelas_total: parcelas.length,
      parcelas_pagas: pagas,
      parcelas_a_vencer: aVencer,
      parcelas_inadimplentes: inadimplentes,
      parcelas_canceladas: canceladas,
      total_em_aberto_vencido: round2(totalVencidoEmAberto),
      total_em_carencia: round2(totalEmCarencia),
      dias_carencia_restantes: situacao_financeira === "em_carencia" ? diasCarenciaRestantes : null,
      dias_tolerancia: DIAS_TOLERANCIA_MENSALIDADE,
    },
  };
}

// ------------------------------------------------------------------ leitura

/**
 * Campos do contrato expostos na API.
 *
 * Ficam de fora, de propósito: `token_publico` (é a chave de assinatura pública
 * do contrato), `assinatura_svg`, `assinatura_ip`, `assinado_em`,
 * `observacoes` (campo livre digitado na recepção, pode conter dado clínico),
 * `criado_por` e `sem_carencia_por` (identificam funcionário).
 */
const CAMPOS_CONTRATO =
  "id,numero,status,paciente_id,paciente_nome,convenio_id,data_inicio,data_fim,dia_vencimento," +
  "valor_mensal,taxa_adesao,num_parcelas,forma_pagamento,tabela_legada,sem_carencia," +
  "titular_apenas_financeiro,numero_renovacoes,contrato_origem_id,renovado_em,created_at,updated_at," +
  "cb_convenios(id,nome,modalidade,max_dependentes)";

type ContratoBruto = {
  id: string;
  numero: number;
  status: string;
  paciente_id: string;
  paciente_nome: string;
  convenio_id: string | null;
  data_inicio: string;
  data_fim: string | null;
  dia_vencimento: number;
  valor_mensal: number | null;
  taxa_adesao: number | null;
  num_parcelas: number;
  forma_pagamento: string | null;
  tabela_legada: boolean;
  sem_carencia: boolean;
  titular_apenas_financeiro: boolean;
  numero_renovacoes: number;
  contrato_origem_id: string | null;
  renovado_em: string | null;
  created_at: string;
  updated_at: string;
  cb_convenios: {
    id: string;
    nome: string;
    modalidade: string | null;
    max_dependentes: number;
  } | null;
};

function serializarContrato(
  c: ContratoBruto,
  parcelas: ParcelaBruta[],
  dependentesAtivos: number,
  hojeIso: string,
) {
  const { situacao_financeira, resumo_financeiro } = resumirContrato(parcelas, hojeIso);
  return {
    id: c.id,
    numero: c.numero,
    status: c.status,
    titular: { paciente_id: c.paciente_id, nome: c.paciente_nome },
    convenio: c.cb_convenios
      ? {
          id: c.cb_convenios.id,
          nome: c.cb_convenios.nome,
          modalidade: c.cb_convenios.modalidade,
        }
      : null,
    vigencia: {
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
      dia_vencimento: c.dia_vencimento,
    },
    valores: {
      valor_mensal: round2(num(c.valor_mensal)),
      taxa_adesao: round2(num(c.taxa_adesao)),
      num_parcelas: c.num_parcelas,
      forma_pagamento: c.forma_pagamento,
    },
    situacao_financeira,
    resumo_financeiro,
    dependentes_ativos: dependentesAtivos,
    renovacao: {
      numero_renovacoes: c.numero_renovacoes,
      contrato_origem_id: c.contrato_origem_id,
      renovado_em: c.renovado_em,
    },
    // `tabela_legada` avisa que o contrato veio da tabela de preço antiga
    // (965 dos 1.991 contratos): nesses, quem vale é o `valor_mensal` do
    // contrato, nunca o valor do convênio.
    flags: {
      tabela_legada: c.tabela_legada,
      sem_carencia: c.sem_carencia,
      titular_apenas_financeiro: c.titular_apenas_financeiro,
    },
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

/** Todas as parcelas dos contratos informados, agrupadas por contrato. */
async function parcelasPorContrato(
  db: Db,
  clinicaId: string,
  contratoIds: string[],
): Promise<Map<string, ParcelaBruta[]>> {
  const mapa = new Map<string, ParcelaBruta[]>();
  for (const id of contratoIds) mapa.set(id, []);
  for (const bloco of emBlocos(contratoIds)) {
    const linhas = await lerTudoPaginado<ParcelaBruta>((de, ate) =>
      db
        .from("contrato_mensalidades")
        .select(
          "id,contrato_id,numero_parcela,vencimento,valor,taxa_adesao,status,pago_em,valor_pago,forma_pagamento,multa,juros,updated_at",
        )
        .eq("clinica_id", clinicaId)
        .in("contrato_id", bloco)
        .order("numero_parcela", { ascending: true })
        .range(de, ate),
    );
    for (const m of linhas) mapa.get(m.contrato_id)?.push(m);
  }
  return mapa;
}

/** Quantos dependentes ativos cada contrato tem. */
async function dependentesAtivosPorContrato(
  db: Db,
  contratoIds: string[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  for (const id of contratoIds) mapa.set(id, 0);
  for (const bloco of emBlocos(contratoIds)) {
    const linhas = await lerTudoPaginado<{ contrato_id: string }>((de, ate) =>
      db
        .from("contrato_dependentes")
        .select("contrato_id")
        .in("contrato_id", bloco)
        .eq("ativo", true)
        .range(de, ate),
    );
    for (const d of linhas) mapa.set(d.contrato_id, (mapa.get(d.contrato_id) ?? 0) + 1);
  }
  return mapa;
}

/**
 * Contratos da clínica que têm parcela vencida, separados por gravidade.
 *
 * Usado só quando a requisição filtra por `situacao_financeira`. Lê apenas duas
 * colunas das parcelas já vencidas (~2,2 mil linhas em produção), o suficiente
 * para dizer quem é inadimplente e quem está apenas em carência.
 */
async function contratosComVencido(
  db: Db,
  clinicaId: string,
  hojeIso: string,
): Promise<{ inadimplentes: Set<string>; emCarencia: Set<string> }> {
  const linhas = await lerTudoPaginado<{ contrato_id: string; vencimento: string }>((de, ate) =>
    db
      .from("contrato_mensalidades")
      .select("contrato_id,vencimento")
      .eq("clinica_id", clinicaId)
      .in("status", STATUS_EM_ABERTO as unknown as string[])
      .lt("vencimento", hojeIso)
      .range(de, ate),
  );

  const inadimplentes = new Set<string>();
  const emCarencia = new Set<string>();
  for (const l of linhas) {
    if (diasAtraso(l.vencimento, hojeIso) > DIAS_TOLERANCIA_MENSALIDADE) {
      inadimplentes.add(l.contrato_id);
    } else {
      emCarencia.add(l.contrato_id);
    }
  }
  // Quem tem uma parcela em carência E outra estourada é inadimplente.
  for (const id of inadimplentes) emCarencia.delete(id);
  return { inadimplentes, emCarencia };
}

// ------------------------------------------------------------------ handlers

const filtroContratos = z.object({
  status: z.enum(["ativo", "cancelado", "renovado"]).optional(),
  situacao_financeira: z.enum(["em_dia", "em_carencia", "inadimplente"]).optional(),
  convenio_id: uuid.optional(),
  paciente_id: uuid.optional(),
  atualizado_desde: dataHoraIso.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

function validarQuery<T extends z.ZodTypeAny>(schema: T, url: URL): z.infer<T> {
  const q = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) {
    throw new ApiError({
      status: 422,
      code: "invalid_query",
      message: "Parâmetros inválidos.",
      details: q.error.flatten().fieldErrors,
    });
  }
  return q.data;
}

async function handleListarContratos(db: Db, ctx: ApiKeyContexto, url: URL) {
  exigirEscopo(ctx, "contracts:read");
  const f = validarQuery(filtroContratos, url);
  const hoje = hojeSaoPauloISO();

  // `teste = false` é sempre aplicado: contrato de teste nunca sai na API.
  const base = () => {
    let q = db.from("contratos_assinatura").select(CAMPOS_CONTRATO, { count: "exact" });
    q = q.eq("clinica_id", ctx.clinica_id).eq("teste", false);
    if (f.status) q = q.eq("status", f.status);
    if (f.convenio_id) q = q.eq("convenio_id", f.convenio_id);
    if (f.paciente_id) q = q.eq("paciente_id", f.paciente_id);
    if (f.atualizado_desde) q = q.gte("updated_at", new Date(f.atualizado_desde).toISOString());
    return q.order("updated_at", { ascending: true }).order("id", { ascending: true });
  };

  let contratos: ContratoBruto[] = [];
  let total = 0;

  if (!f.situacao_financeira) {
    const { data, error, count } = await base().range(f.offset, f.offset + f.limite - 1);
    if (error) {
      throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao listar." });
    }
    contratos = (data ?? []) as unknown as ContratoBruto[];
    total = count ?? 0;
  } else {
    // `situacao_financeira` é calculada, não existe como coluna: o banco não
    // consegue filtrar nem paginar por ela. Resolve-se em duas etapas — a lista
    // completa de ids que passam nos outros filtros (2 colunas, no máximo ~2 mil
    // linhas) é cruzada em memória com o conjunto de contratos vencidos, e só a
    // página final volta ao banco para buscar os campos completos.
    const { inadimplentes, emCarencia } = await contratosComVencido(db, ctx.clinica_id, hoje);
    const candidatos = await lerTudoPaginado<{ id: string }>((de, ate) => {
      let q = db.from("contratos_assinatura").select("id,updated_at");
      q = q.eq("clinica_id", ctx.clinica_id).eq("teste", false);
      if (f.status) q = q.eq("status", f.status);
      if (f.convenio_id) q = q.eq("convenio_id", f.convenio_id);
      if (f.paciente_id) q = q.eq("paciente_id", f.paciente_id);
      if (f.atualizado_desde) q = q.gte("updated_at", new Date(f.atualizado_desde).toISOString());
      return q
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(de, ate);
    });

    const pertence = (id: string) =>
      f.situacao_financeira === "inadimplente"
        ? inadimplentes.has(id)
        : f.situacao_financeira === "em_carencia"
          ? emCarencia.has(id)
          : !inadimplentes.has(id) && !emCarencia.has(id);

    const filtrados = candidatos.filter((c) => pertence(c.id));
    total = filtrados.length;
    const idsPagina = filtrados.slice(f.offset, f.offset + f.limite).map((c) => c.id);
    if (idsPagina.length > 0) {
      const { data, error } = await db
        .from("contratos_assinatura")
        .select(CAMPOS_CONTRATO)
        .in("id", idsPagina)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao listar." });
      }
      contratos = (data ?? []) as unknown as ContratoBruto[];
    }
  }

  const ids = contratos.map((c) => c.id);
  const [parcelas, dependentes] = await Promise.all([
    parcelasPorContrato(db, ctx.clinica_id, ids),
    dependentesAtivosPorContrato(db, ids),
  ]);

  return ok(200, {
    contracts: contratos.map((c) =>
      serializarContrato(c, parcelas.get(c.id) ?? [], dependentes.get(c.id) ?? 0, hoje),
    ),
    total,
    limite: f.limite,
    offset: f.offset,
  });
}

/**
 * Localiza um contrato da clínica da chave.
 *
 * Contrato inexistente e contrato de outra clínica devolvem o MESMO 404, de
 * propósito: a API não confirma a existência de contrato alheio.
 */
async function buscarContrato(db: Db, ctx: ApiKeyContexto, ref: string): Promise<ContratoBruto> {
  const naoEncontrado = new ApiError({
    status: 404,
    code: "contract_not_found",
    message: "Contrato não encontrado nesta clínica.",
  });
  if (!z.string().uuid().safeParse(ref).success) throw naoEncontrado;

  const { data, error } = await db
    .from("contratos_assinatura")
    .select(CAMPOS_CONTRATO)
    .eq("clinica_id", ctx.clinica_id)
    .eq("teste", false)
    .eq("id", ref)
    .maybeSingle();
  if (error) {
    throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao ler o contrato." });
  }
  if (!data) throw naoEncontrado;
  return data as unknown as ContratoBruto;
}

type MembroPaciente = {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  telefone: string | null;
};

async function lerPacientes(
  db: Db,
  clinicaId: string,
  ids: string[],
): Promise<Map<string, MembroPaciente>> {
  const mapa = new Map<string, MembroPaciente>();
  for (const bloco of emBlocos(ids)) {
    const { data, error } = await db
      .from("pacientes")
      .select("id,nome,cpf,data_nascimento,telefone")
      .eq("clinica_id", clinicaId)
      .in("id", bloco);
    if (error) {
      throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao ler pacientes." });
    }
    for (const p of (data ?? []) as MembroPaciente[]) mapa.set(p.id, p);
  }
  return mapa;
}

type DependenteBruto = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  incluido_em: string;
  excluido_em: string | null;
  ativo: boolean;
};

async function montarMembros(db: Db, ctx: ApiKeyContexto, c: ContratoBruto, apenasAtivos: boolean) {
  let q = db
    .from("contrato_dependentes")
    .select("id,paciente_id,paciente_nome,parentesco,tipo,incluido_em,excluido_em,ativo")
    .eq("contrato_id", c.id);
  if (apenasAtivos) q = q.eq("ativo", true);
  const { data, error } = await q.order("incluido_em", { ascending: true });
  if (error) {
    throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao ler dependentes." });
  }
  const dependentes = (data ?? []) as DependenteBruto[];

  const pacientes = await lerPacientes(db, ctx.clinica_id, [
    c.paciente_id,
    ...dependentes.map((d) => d.paciente_id),
  ]);
  const titularPac = pacientes.get(c.paciente_id);

  return {
    contrato_id: c.id,
    titular: {
      paciente_id: c.paciente_id,
      nome: titularPac?.nome ?? c.paciente_nome,
      cpf: cpfDigitos(titularPac?.cpf),
      data_nascimento: titularPac?.data_nascimento ?? null,
      telefone: titularPac?.telefone ?? null,
      // Titular "apenas financeiro" paga mas NÃO é atendido pelo cartão: não
      // deve ser contado como vida coberta do outro lado.
      apenas_financeiro: c.titular_apenas_financeiro,
    },
    dependentes: dependentes.map((d) => {
      const p = pacientes.get(d.paciente_id);
      return {
        id: d.id,
        paciente_id: d.paciente_id,
        nome: p?.nome ?? d.paciente_nome,
        cpf: cpfDigitos(p?.cpf),
        data_nascimento: p?.data_nascimento ?? null,
        parentesco: d.parentesco,
        tipo: d.tipo,
        incluido_em: d.incluido_em,
        excluido_em: d.excluido_em,
        ativo: d.ativo,
      };
    }),
    total_dependentes_ativos: dependentes.filter((d) => d.ativo).length,
    max_dependentes: c.cb_convenios?.max_dependentes ?? null,
  };
}

async function handleBuscarContrato(db: Db, ctx: ApiKeyContexto, ref: string) {
  exigirEscopo(ctx, "contracts:read");
  const hoje = hojeSaoPauloISO();
  const c = await buscarContrato(db, ctx, ref);
  const [parcelas, dependentes] = await Promise.all([
    parcelasPorContrato(db, ctx.clinica_id, [c.id]),
    dependentesAtivosPorContrato(db, [c.id]),
  ]);
  const corpo = serializarContrato(
    c,
    parcelas.get(c.id) ?? [],
    dependentes.get(c.id) ?? 0,
    hoje,
  ) as Record<string, unknown>;

  // Dado pessoal do titular e dos dependentes só entra se a chave tiver o
  // escopo próprio — dá para liberar os números do contrato sem liberar CPF.
  if (ctx.escopos.includes("members:read")) {
    corpo["membros"] = await montarMembros(db, ctx, c, true);
  }
  return ok(200, corpo);
}

async function handleMembros(db: Db, ctx: ApiKeyContexto, ref: string, url: URL) {
  exigirEscopo(ctx, "members:read");
  const f = validarQuery(z.object({ ativos: z.enum(["true", "false"]).default("true") }), url);
  const c = await buscarContrato(db, ctx, ref);
  return ok(200, await montarMembros(db, ctx, c, f.ativos === "true"));
}

async function handleParcelasDoContrato(db: Db, ctx: ApiKeyContexto, ref: string) {
  exigirEscopo(ctx, "billing:read");
  const hoje = hojeSaoPauloISO();
  const c = await buscarContrato(db, ctx, ref);
  const parcelas = (await parcelasPorContrato(db, ctx.clinica_id, [c.id])).get(c.id) ?? [];
  return ok(200, {
    contrato_id: c.id,
    installments: parcelas.map((m) => serializarParcela(m, hoje)),
    total: parcelas.length,
    dias_tolerancia: DIAS_TOLERANCIA_MENSALIDADE,
  });
}

const filtroParcelas = z.object({
  vencimento_de: dataIso.optional(),
  vencimento_ate: dataIso.optional(),
  pago_de: dataIso.optional(),
  pago_ate: dataIso.optional(),
  situacao: z.string().max(120).optional(),
  contrato_id: uuid.optional(),
  atualizado_desde: dataHoraIso.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

const SITUACOES: SituacaoParcela[] = ["paga", "a_vencer", "inadimplente", "cancelada"];

async function handleListarParcelas(db: Db, ctx: ApiKeyContexto, url: URL) {
  exigirEscopo(ctx, "billing:read");
  const f = validarQuery(filtroParcelas, url);
  const hoje = hojeSaoPauloISO();

  let situacoesPedidas: SituacaoParcela[] | null = null;
  if (f.situacao) {
    const pedidas = f.situacao
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalidas = pedidas.filter((s) => !SITUACOES.includes(s as SituacaoParcela));
    if (invalidas.length > 0) {
      throw new ApiError({
        status: 422,
        code: "invalid_query",
        message: "Parâmetros inválidos.",
        details: { situacao: [`Valores aceitos: ${SITUACOES.join(", ")}.`] },
      });
    }
    situacoesPedidas = pedidas as SituacaoParcela[];
  }

  const consulta = (de: number, ate: number) => {
    let q = db
      .from("contrato_mensalidades")
      .select(
        "id,contrato_id,numero_parcela,vencimento,valor,taxa_adesao,status,pago_em,valor_pago,forma_pagamento,multa,juros,updated_at",
      )
      .eq("clinica_id", ctx.clinica_id);
    if (f.contrato_id) q = q.eq("contrato_id", f.contrato_id);
    if (f.vencimento_de) q = q.gte("vencimento", f.vencimento_de);
    if (f.vencimento_ate) q = q.lte("vencimento", f.vencimento_ate);
    if (f.pago_de) q = q.gte("pago_em", f.pago_de);
    if (f.pago_ate) q = q.lte("pago_em", f.pago_ate);
    if (f.atualizado_desde) q = q.gte("updated_at", new Date(f.atualizado_desde).toISOString());
    return q
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, ate);
  };

  // `situacao` é calculada, então o recorte e os totais são feitos aqui. O
  // conjunto lido já vem restrito pelos filtros de data/contrato da requisição.
  const brutas = await lerTudoPaginado<ParcelaBruta>(consulta);
  const serializadas = brutas
    .map((m) => serializarParcela(m, hoje))
    .filter((m) => !situacoesPedidas || situacoesPedidas.includes(m.situacao));

  const totais = {
    quantidade: serializadas.length,
    valor_total: round2(serializadas.reduce((s, m) => s + m.valor, 0)),
    por_situacao: Object.fromEntries(
      SITUACOES.map((s) => {
        const itens = serializadas.filter((m) => m.situacao === s);
        return [
          s,
          { quantidade: itens.length, valor: round2(itens.reduce((acc, m) => acc + m.valor, 0)) },
        ];
      }),
    ),
  };

  const pagina = serializadas.slice(f.offset, f.offset + f.limite);
  const brutasPorId = new Map(brutas.map((m) => [m.id, m]));
  const idsContratos = [...new Set(pagina.map((m) => brutasPorId.get(m.id)!.contrato_id))];

  // O relatório de pagamento precisa do número do contrato e do nome do titular
  // sem uma segunda chamada por parcela.
  const cabecalhos = new Map<string, { numero: number; titular_nome: string }>();
  for (const bloco of emBlocos(idsContratos)) {
    const { data, error } = await db
      .from("contratos_assinatura")
      .select("id,numero,paciente_nome")
      .eq("clinica_id", ctx.clinica_id)
      .in("id", bloco);
    if (error) {
      throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao listar." });
    }
    for (const c of (data ?? []) as Array<{ id: string; numero: number; paciente_nome: string }>) {
      cabecalhos.set(c.id, { numero: c.numero, titular_nome: c.paciente_nome });
    }
  }

  return ok(200, {
    installments: pagina.map((m) => {
      const contratoId = brutasPorId.get(m.id)!.contrato_id;
      const cab = cabecalhos.get(contratoId);
      return {
        ...m,
        contrato_id: contratoId,
        contrato_numero: cab?.numero ?? null,
        titular_nome: cab?.titular_nome ?? null,
      };
    }),
    totais,
    total: serializadas.length,
    limite: f.limite,
    offset: f.offset,
    dias_tolerancia: DIAS_TOLERANCIA_MENSALIDADE,
  });
}

async function handlePlanos(db: Db, ctx: ApiKeyContexto) {
  exigirEscopo(ctx, "plans:read");
  const { data, error } = await db
    .from("cb_convenios")
    .select(
      "id,nome,modalidade,ativo,valor_mensal,taxa_adesao,taxa_inclusao_dependente,num_parcelas,max_dependentes,fidelidade_meses,vigencia_meses,adesao_no_ato",
    )
    .eq("clinica_id", ctx.clinica_id)
    .order("nome", { ascending: true });
  if (error) {
    throw new ApiError({ status: 500, code: "read_failed", message: "Falha ao listar os planos." });
  }
  const planos = (data ?? []) as Array<Record<string, unknown>>;

  // Contagem de contratos ativos por convênio, para o de-para com o catálogo
  // do outro lado não ser feito no escuro.
  const ativos = await lerTudoPaginado<{ convenio_id: string | null }>((de, ate) =>
    db
      .from("contratos_assinatura")
      .select("convenio_id")
      .eq("clinica_id", ctx.clinica_id)
      .eq("teste", false)
      .eq("status", "ativo")
      .range(de, ate),
  );
  const porConvenio = new Map<string, number>();
  for (const c of ativos) {
    if (c.convenio_id) porConvenio.set(c.convenio_id, (porConvenio.get(c.convenio_id) ?? 0) + 1);
  }

  return ok(200, {
    plans: planos.map((p) => ({
      id: p["id"],
      nome: p["nome"],
      modalidade: p["modalidade"],
      ativo: p["ativo"],
      valor_mensal: round2(num(p["valor_mensal"])),
      taxa_adesao: round2(num(p["taxa_adesao"])),
      taxa_inclusao_dependente: round2(num(p["taxa_inclusao_dependente"])),
      num_parcelas: p["num_parcelas"],
      max_dependentes: p["max_dependentes"],
      fidelidade_meses: p["fidelidade_meses"],
      vigencia_meses: p["vigencia_meses"],
      adesao_no_ato: p["adesao_no_ato"],
      contratos_ativos: porConvenio.get(String(p["id"])) ?? 0,
    })),
    total: planos.length,
  });
}

// ------------------------------------------------------------------ roteador

/**
 * Rotas de leitura do Cartão. Devolve `null` quando o caminho não é deste
 * módulo, para o roteador da v1 seguir tentando os outros recursos.
 */
export async function rotearCartaoV1(
  db: Db,
  ctx: ApiKeyContexto,
  metodo: string,
  partes: string[],
  url: URL,
): Promise<{ status: number; body: unknown } | null> {
  if (metodo !== "GET") return null;
  const [recurso, ref, sub] = partes;

  if (recurso === "contracts") {
    if (partes.length === 1) return handleListarContratos(db, ctx, url);
    if (partes.length === 2) return handleBuscarContrato(db, ctx, decodeURIComponent(ref!));
    if (partes.length === 3 && sub === "members") {
      return handleMembros(db, ctx, decodeURIComponent(ref!), url);
    }
    if (partes.length === 3 && sub === "installments") {
      return handleParcelasDoContrato(db, ctx, decodeURIComponent(ref!));
    }
    return null;
  }
  if (recurso === "billing" && partes.length === 2 && ref === "installments") {
    return handleListarParcelas(db, ctx, url);
  }
  if (recurso === "plans" && partes.length === 1) return handlePlanos(db, ctx);
  return null;
}
