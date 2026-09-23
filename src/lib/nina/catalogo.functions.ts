/**
 * Catálogo estruturado da Base de Conhecimentos da Nina — server functions.
 *
 * Segurança: toda operação confere no BACKEND o vínculo ativo com a clínica.
 * Leitura = qualquer membro ativo; escrita e publicação = admin/gestor.
 *
 * Publicação: RASCUNHO / PUBLICADO / ARQUIVADO. Editar um item publicado sem
 * publicar guarda a alteração em `rascunho` — o conteúdo publicado continua
 * intacto até alguém publicar de novo.
 *
 * Esta fase NÃO troca a fonte usada no atendimento: o catálogo é cadastrado,
 * mas quem responde a Nina continua sendo a planilha ativa.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { profissionalSchema, servicoSchema, valorResumo, STATUS_CATALOGO } from "./catalogo";
import { separarAtendimentos } from "./catalogo-estrutura";
import { validarSelecaoLote, publicarLoteValidado, LIMITE_EDICAO_LOTE } from "./catalogo-lote-ia";
import {
  aplicarEdicaoCatalogoIA,
  dadosEditaveisCatalogo,
  CONFLITO_EDICAO_CATALOGO,
  type PreviaEdicaoCatalogo,
} from "./catalogo-edicao-ia";

const TABELA = {
  servico: "nina_cat_servicos",
  profissional: "nina_cat_profissionais",
} as const;

type Tipo = keyof typeof TABELA;

async function membership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
  return String(data.role);
}

async function exigirMembro(supabase: any, userId: string, clinicaId: string) {
  await membership(supabase, userId, clinicaId);
}

async function exigirAdmin(supabase: any, userId: string, clinicaId: string) {
  const role = await membership(supabase, userId, clinicaId);
  if (!["admin", "gestor"].includes(role))
    throw new Error("Apenas administradores e gestores podem editar o catálogo da Nina.");
}

const COLUNAS_SERVICO =
  "id, procedimento_id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, nota_interna, executantes, formas_pagamento, estrutura, status, rascunho, publicado_em, created_at, updated_at";

const COLUNAS_PROFISSIONAL =
  "id, medico_id, unidade_id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, nota_interna, estrutura, status, rascunho, publicado_em, created_at, updated_at";

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export const listarCatalogoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirMembro(context.supabase, context.userId, data.clinicaId);
    const [servicos, profissionais] = await Promise.all([
      context.supabase
        .from(TABELA.servico)
        .select(COLUNAS_SERVICO)
        .eq("clinica_id", data.clinicaId)
        .order("nome"),
      context.supabase
        .from(TABELA.profissional)
        .select(COLUNAS_PROFISSIONAL)
        .eq("clinica_id", data.clinicaId)
        .order("nome"),
    ]);
    if (servicos.error) throw new Error(servicos.error.message);
    if (profissionais.error) throw new Error(profissionais.error.message);
    return { servicos: servicos.data ?? [], profissionais: profissionais.data ?? [] };
  });

/** Cadastros já existentes no sistema, reutilizados nos vínculos do catálogo. */
export const opcoesCatalogoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirMembro(context.supabase, context.userId, data.clinicaId);
    const sb = context.supabase;
    const [procedimentos, medicos, especialidades, unidades, convenios] = await Promise.all([
      sb
        .from("procedimentos")
        .select("id, nome, tipo, valor_padrao, preparo")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      sb
        .from("medicos")
        .select("id, nome, especialidade_id")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      sb.from("especialidades").select("id, nome").eq("ativo", true).order("nome"),
      sb
        .from("unidades")
        .select("id, nome")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      sb
        .from("cb_convenios")
        .select("id, nome")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
    ]);
    return {
      procedimentos: procedimentos.data ?? [],
      medicos: medicos.data ?? [],
      especialidades: especialidades.data ?? [],
      unidades: unidades.data ?? [],
      convenios: convenios.data ?? [],
    };
  });

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

async function salvar(
  context: any,
  tipo: Tipo,
  clinicaId: string,
  id: string | null,
  dados: Record<string, unknown>,
  publicar: boolean,
  esperadoUpdatedAt?: string,
) {
  await exigirAdmin(context.supabase, context.userId, clinicaId);
  const sb = context.supabase;
  const tabela = TABELA[tipo];

  if (esperadoUpdatedAt && !id) throw new Error("Selecione um cadastro existente para editar.");
  let atual: { status: string; updated_at: string } | null = null;
  if (id) {
    const { data, error } = await sb
      .from(tabela)
      .select("id, status, updated_at")
      .eq("id", id)
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Registro não encontrado nesta clínica.");
    atual = data as { status: string; updated_at: string };
    if (esperadoUpdatedAt && atual.updated_at !== esperadoUpdatedAt)
      throw new Error(CONFLITO_EDICAO_CATALOGO);
  }

  // O filtro também protege contra uma edição que ocorra entre a leitura e o update.
  async function atualizar(registro: Record<string, unknown>) {
    let query = sb.from(tabela).update(registro).eq("id", id!).eq("clinica_id", clinicaId);
    if (esperadoUpdatedAt) query = query.eq("updated_at", esperadoUpdatedAt);
    const { data: alterado, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!alterado) throw new Error(CONFLITO_EDICAO_CATALOGO);
  }

  // Edição de item PUBLICADO sem publicar: fica em revisão, sem expor a mudança.
  if (atual?.status === "PUBLICADO" && !publicar) {
    await atualizar({ rascunho: dados });
    return { id: id!, status: "PUBLICADO", emRevisao: true };
  }

  const status = publicar ? "PUBLICADO" : (atual?.status ?? "RASCUNHO");
  const registro: Record<string, unknown> = {
    ...dados,
    clinica_id: clinicaId,
    status,
    rascunho: null,
    publicado_em: publicar ? new Date().toISOString() : null,
    publicado_por: publicar ? context.userId : null,
  };

  if (id) {
    await atualizar(registro);
    return { id, status, emRevisao: false };
  }

  registro["criado_por"] = context.userId;
  const { data: criado, error } = await sb.from(tabela).insert(registro).select("id").single();
  if (error) throw new Error(error.message);
  return { id: String(criado.id), status, emRevisao: false };
}

export const salvarServicoCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().nullable().optional().default(null),
        publicar: z.boolean().optional().default(false),
        dados: servicoSchema,
        esperadoUpdatedAt: z.string().datetime({ offset: true }).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const d = data.dados;
    // Fonte única de preço: com formas de pagamento valoradas, o resumo vem delas.
    const dados = { ...d, valor: valorResumo(d) };
    return await salvar(
      context,
      "servico",
      data.clinicaId,
      data.id ?? null,
      dados,
      data.publicar,
      data.esperadoUpdatedAt,
    );
  });

export const salvarProfissionalCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid().nullable().optional().default(null),
        publicar: z.boolean().optional().default(false),
        dados: profissionalSchema,
        esperadoUpdatedAt: z.string().datetime({ offset: true }).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) =>
    salvar(
      context,
      "profissional",
      data.clinicaId,
      data.id ?? null,
      data.dados,
      data.publicar,
      data.esperadoUpdatedAt,
    ),
  );

export const alterarStatusCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        tipo: z.enum(["servico", "profissional"]),
        id: z.string().uuid(),
        status: z.enum(STATUS_CATALOGO),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const tabela = TABELA[data.tipo as Tipo];

    // Publicar aplica o que estava em revisão, se houver.
    const { data: atual, error: erroLeitura } = await context.supabase
      .from(tabela)
      .select("id, rascunho")
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    if (!atual) throw new Error("Registro não encontrado nesta clínica.");

    const revisao =
      data.status === "PUBLICADO" && atual.rascunho && typeof atual.rascunho === "object"
        ? (atual.rascunho as Record<string, unknown>)
        : {};

    const { error } = await context.supabase
      .from(tabela)
      .update({
        ...revisao,
        status: data.status,
        rascunho: null,
        publicado_em: data.status === "PUBLICADO" ? new Date().toISOString() : null,
        publicado_por: data.status === "PUBLICADO" ? context.userId : null,
      })
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
  });

export const excluirItemCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        tipo: z.enum(["servico", "profissional"]),
        id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from(TABELA[data.tipo as Tipo])
      .delete()
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Fase 3 — "Criar com IA": organiza texto livre nos campos do formulário */
/* ------------------------------------------------------------------ */

/**
 * Chama o modelo apenas para ORGANIZAR o texto colado nos campos do
 * formulário. Nada é gravado aqui: o retorno é um rascunho para revisão.
 * O texto original não é armazenado nem vira fonte de conhecimento da Nina.
 */
export const organizarTextoCatalogoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        tipo: z.enum(["servico", "profissional"]),
        texto: z.string().trim().min(10, "Escreva ou cole as informações a organizar.").max(20000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { organizarTextoComIA } = await import("./catalogo-ia.server");
    return await organizarTextoComIA(data.tipo, data.texto);
  });

/** Lê o cadastro da clínica e gera uma prévia. Não grava nem publica. */
export const preverEdicaoCatalogoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        tipo: z.enum(["servico", "profissional"]),
        id: z.string().uuid(),
        texto: z.string().trim().min(10, "Descreva a alteração desejada.").max(20000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PreviaEdicaoCatalogo> => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const sb: any = context.supabase;
    const { data: registro, error } = await sb
      .from(TABELA[data.tipo])
      .select(data.tipo === "servico" ? COLUNAS_SERVICO : COLUNAS_PROFISSIONAL)
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!registro) throw new Error("Registro não encontrado nesta clínica.");
    const { editarTextoComIA } = await import("./catalogo-ia.server");
    const proposta = await editarTextoComIA(
      data.tipo,
      data.texto,
      dadosEditaveisCatalogo(data.tipo, registro),
    );
    const previa = aplicarEdicaoCatalogoIA(data.tipo, registro, proposta);
    return {
      ...previa,
      id: data.id,
      nome: registro.nome,
      tipo: data.tipo,
      esperadoUpdatedAt: registro.updated_at,
      incluiRascunho: !!registro.rascunho,
    };
  });

/** Procura nas duas abas da mesma clínica. A seleção e a prévia não escrevem. */
export const selecionarEdicoesCatalogoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), texto: z.string().trim().min(10).max(20000) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const sb: any = context.supabase;
    const catalogo: Array<
      Record<string, any> & { id: string; tipo: "servico" | "profissional"; nome: string }
    > = [];
    for (const tipo of ["servico", "profissional"] as const) {
      // Paginado para não omitir alvos quando o catálogo ultrapassar o limite REST.
      for (let inicio = 0; ; inicio += 500) {
        const r = await sb
          .from(TABELA[tipo])
          .select(tipo === "servico" ? COLUNAS_SERVICO : COLUNAS_PROFISSIONAL)
          .eq("clinica_id", data.clinicaId)
          .neq("status", "ARQUIVADO")
          .order("id")
          .range(inicio, inicio + 499);
        if (r.error) throw new Error(r.error.message);
        for (const registro of r.data ?? []) {
          const d = dadosEditaveisCatalogo(tipo, registro);
          catalogo.push({
            id: registro.id,
            tipo,
            nome: d.nome,
            especialidades: d.especialidades?.map((e: any) => e.nome),
            aliases: d.estrutura?.aliases,
            atendimentos: separarAtendimentos(
              tipo === "servico" ? d.descricao_publica : d.observacao_publica,
              tipo === "profissional" ? d.nome : undefined,
            ).map((a) => ({
              atendimento: a.atendimento,
              profissional: a.profissional,
              especialidade: a.especialidade,
            })),
            formas_pagamento: d.formas_pagamento,
          });
        }
        if ((r.data?.length ?? 0) < 500) break;
      }
    }
    const { selecionarCadastrosComIA } = await import("./catalogo-ia.server");
    return validarSelecaoLote(await selecionarCadastrosComIA(data.texto, catalogo), catalogo);
  });

const itemPublicacaoLoteSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("servico"),
    id: z.string().uuid(),
    esperadoUpdatedAt: z.string().datetime({ offset: true }),
    dados: servicoSchema,
  }),
  z.object({
    tipo: z.literal("profissional"),
    id: z.string().uuid(),
    esperadoUpdatedAt: z.string().datetime({ offset: true }),
    dados: profissionalSchema,
  }),
]);

export const publicarEdicoesCatalogoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        itens: z.array(itemPublicacaoLoteSchema).min(1).max(LIMITE_EDICAO_LOTE),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const itens = data.itens.map((i) => ({
      ...i,
      nome: i.dados.nome,
      mudancas: [],
      incluiRascunho: false,
    }));
    return publicarLoteValidado(
      itens,
      async (item) => {
        const r = await context.supabase
          .from(TABELA[item.tipo])
          .select("id, updated_at")
          .eq("clinica_id", data.clinicaId)
          .eq("id", item.id)
          .maybeSingle();
        if (r.error) throw new Error(r.error.message);
        if (!r.data || r.data.updated_at !== item.esperadoUpdatedAt)
          throw new Error(`${item.nome}: ${CONFLITO_EDICAO_CATALOGO}`);
      },
      async (item) => {
        const dados =
          item.tipo === "servico" ? { ...item.dados, valor: valorResumo(item.dados) } : item.dados;
        await salvar(
          context,
          item.tipo,
          data.clinicaId,
          item.id,
          dados,
          true,
          item.esperadoUpdatedAt,
        );
      },
    );
  });
