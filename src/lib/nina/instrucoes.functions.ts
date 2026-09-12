/**
 * Instruções da Nina — fonte persistente e versionada do Prompt Principal.
 *
 * Tabela: public.nina_instrucoes_versoes
 *  - escopo: "whatsapp" (pacientes) | "painel_interno" (equipe)
 *  - clinica_id NULL = padrão global (decisão do time na Fase 1)
 *  - status: rascunho | publicada | arquivada (só UMA publicada por escopo)
 *
 * FASE 2: rascunho NÃO tem efeito nenhum no atendimento. A Nina continua
 * usando o texto do código (fallback preservado). Aqui só lemos e gravamos.
 *
 * Nunca guardar chave, token, secret ou credencial neste conteúdo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { capacidadesDoPapel, type CapacidadeArquitetura } from "./arquitetura/permissoes";
import { validarTemplateInstrucoes } from "./instrucoes-template";
import { validarIdentidadeParaPublicacao } from "./identidade-atendimento";

const TAB = "nina_instrucoes_versoes";

export const ESCOPOS = ["whatsapp", "painel_interno"] as const;
export type EscopoInstrucoes = (typeof ESCOPOS)[number];

export const ROTULO_ESCOPO: Record<EscopoInstrucoes, string> = {
  whatsapp: "Nina do WhatsApp (pacientes)",
  painel_interno: "Nina do painel interno (equipe)",
};

export type VersaoInstrucoes = {
  id: string;
  escopo: EscopoInstrucoes;
  versao: number;
  conteudo: string;
  status: "rascunho" | "publicada" | "arquivada";
  comentario: string | null;
  created_at: string;
  publicado_em: string | null;
};

export type InstrucoesEscopo = {
  escopo: EscopoInstrucoes;
  publicada: VersaoInstrucoes | null;
  rascunho: VersaoInstrucoes | null;
};

const COLUNAS = "id, escopo, versao, conteudo, status, comentario, created_at, publicado_em";

/**
 * FASE 7 — autorização real, sempre no servidor.
 *
 * O papel vem de `user_roles` lido como o próprio usuário (RLS). Nada de
 * permissão enviada pelo frontend. Atendimento comum (recepção, caixa,
 * enfermagem, financeiro) não recebe nenhuma dessas capacidades.
 */
async function exigirCapacidade(
  supabase: any,
  userId: string,
  clinicaId: string,
  capacidade: CapacidadeArquitetura,
): Promise<void> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId);
  const permitido = ((data ?? []) as Array<{ role: string }>).some((p) =>
    capacidadesDoPapel(String(p.role)).includes(capacidade),
  );
  if (!permitido) {
    throw new Error(
      capacidade === "nina.instrucoes.publicar"
        ? "Você não tem permissão para publicar as Instruções da Nina."
        : "Você não tem permissão para esta ação nas Instruções da Nina.",
    );
  }
}

/**
 * FASE 7 — auditoria das Instruções da Nina.
 *
 * Gravada com o cliente administrativo de propósito: `audit_log` não aceita
 * INSERT do usuário autenticado, justamente para ninguém forjar ou apagar o
 * próprio rastro. Nunca guardamos secrets aqui — apenas versões, autor, data
 * e comentário.
 */
async function auditar(dados: {
  clinicaId: string;
  userId: string;
  acao: "NINA_INSTRUCOES_RASCUNHO" | "NINA_INSTRUCOES_PUBLICACAO" | "NINA_INSTRUCOES_RESTAURACAO";
  escopo: string;
  versaoAnterior: number | null;
  versaoNova: number | null;
  comentario?: string | null;
  restauradaDe?: number | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      clinica_id: dados.clinicaId,
      user_id: dados.userId,
      table_name: TAB,
      action: dados.acao,
      dados_depois: {
        escopo: dados.escopo,
        versao_anterior: dados.versaoAnterior,
        versao_nova: dados.versaoNova,
        restaurada_de: dados.restauradaDe ?? null,
        comentario: dados.comentario ?? null,
        em: new Date().toISOString(),
      },
    } as never);
  } catch (e) {
    console.warn("[nina-instrucoes] auditoria:", e instanceof Error ? e.message : e);
  }
}

/** Padrão global (clinica_id NULL): publicada ativa + rascunho mais recente por escopo. */
export const carregarInstrucoesNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data: entrada, context }): Promise<InstrucoesEscopo[]> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await exigirCapacidade(supabase, userId, entrada.clinicaId, "nina.instrucoes.ver");
    const { data, error } = await supabase
      .from(TAB)
      .select(COLUNAS)
      .is("clinica_id", null)
      .in("status", ["publicada", "rascunho"])
      .order("versao", { ascending: false });
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as VersaoInstrucoes[];
    return ESCOPOS.map((escopo) => ({
      escopo,
      publicada: linhas.find((l) => l.escopo === escopo && l.status === "publicada") ?? null,
      rascunho: linhas.find((l) => l.escopo === escopo && l.status === "rascunho") ?? null,
    }));
  });

/**
 * Salva (cria ou atualiza) o rascunho do escopo. Não publica e não altera
 * a versão publicada — o atendimento continua exatamente como está.
 */
export const salvarRascunhoInstrucoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        escopo: z.enum(ESCOPOS),
        conteudo: z.string().min(1).max(60000),
        comentario: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VersaoInstrucoes> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await exigirCapacidade(supabase, userId, data.clinicaId, "nina.instrucoes.editar");

    const { data: atuais, error: erroLeitura } = await supabase
      .from(TAB)
      .select("id, versao, status")
      .is("clinica_id", null)
      .eq("escopo", data.escopo)
      .order("versao", { ascending: false });
    if (erroLeitura) throw new Error(erroLeitura.message);

    const linhas = (atuais ?? []) as Array<{ id: string; versao: number; status: string }>;
    const rascunho = linhas.find((l) => l.status === "rascunho");
    const publicada = linhas.find((l) => l.status === "publicada");

    if (rascunho) {
      const { data: atualizado, error } = await supabase
        .from(TAB)
        .update({ conteudo: data.conteudo, comentario: data.comentario ?? null })
        .eq("id", rascunho.id)
        .select(COLUNAS)
        .single();
      if (error) throw new Error(error.message);
      await auditar({
        clinicaId: data.clinicaId,
        userId,
        acao: "NINA_INSTRUCOES_RASCUNHO",
        escopo: data.escopo,
        versaoAnterior: publicada?.versao ?? null,
        versaoNova: (atualizado as VersaoInstrucoes).versao,
        comentario: data.comentario ?? null,
      });
      return atualizado as VersaoInstrucoes;
    }

    const proxima = (linhas[0]?.versao ?? 0) + 1;
    const { data: criado, error } = await supabase
      .from(TAB)
      .insert({
        clinica_id: null,
        escopo: data.escopo,
        versao: proxima,
        conteudo: data.conteudo,
        status: "rascunho",
        comentario: data.comentario ?? null,
        versao_anterior_id: publicada?.id ?? null,
        criado_por: userId,
      })
      .select(COLUNAS)
      .single();
    if (error) throw new Error(error.message);
    await auditar({
      clinicaId: data.clinicaId,
      userId,
      acao: "NINA_INSTRUCOES_RASCUNHO",
      escopo: data.escopo,
      versaoAnterior: publicada?.versao ?? null,
      versaoNova: (criado as VersaoInstrucoes).versao,
      comentario: data.comentario ?? null,
    });
    return criado as VersaoInstrucoes;
  });

export type VersaoHistorico = VersaoInstrucoes & { autor: string | null };

/** Histórico completo do escopo — nenhuma versão é omitida. */
export const historicoInstrucoesNina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), escopo: z.enum(ESCOPOS) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<VersaoHistorico[]> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await exigirCapacidade(supabase, userId, data.clinicaId, "nina.instrucoes.historico");
    const { data: linhas, error } = await supabase
      .from(TAB)
      .select(`${COLUNAS}, criado_por, publicado_por`)
      .is("clinica_id", null)
      .eq("escopo", data.escopo)
      .order("versao", { ascending: false });
    if (error) throw new Error(error.message);

    const versoes = (linhas ?? []) as Array<
      VersaoInstrucoes & { criado_por: string | null; publicado_por: string | null }
    >;
    const ids = Array.from(
      new Set(versoes.flatMap((v) => [v.publicado_por, v.criado_por]).filter(Boolean) as string[]),
    );

    let nomes = new Map<string, string | null>();
    if (ids.length) {
      const { data: autores } = await supabase.rpc("nina_instrucoes_autores", { p_ids: ids });
      nomes = new Map(
        ((autores ?? []) as Array<{ id: string; nome: string | null }>).map((a) => [a.id, a.nome]),
      );
    }

    return versoes.map((v) => {
      const responsavel = v.publicado_por ?? v.criado_por;
      return { ...v, autor: responsavel ? (nomes.get(responsavel) ?? null) : null };
    });
  });

/**
 * Publica o conteúdo como uma NOVA versão. A versão publicada anterior é
 * arquivada (nunca apagada). Restaurar uma versão antiga usa esta mesma
 * função, enviando o conteúdo dela.
 */
export const publicarInstrucoesNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        escopo: z.enum(ESCOPOS),
        conteudo: z.string().min(1).max(60000),
        comentario: z.string().trim().max(500).optional(),
        /** Número da versão restaurada, quando a publicação vier do histórico. */
        restauradaDe: z.number().int().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VersaoInstrucoes> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    // FASE 7 — publicar é permissão separada de editar.
    await exigirCapacidade(supabase, userId, data.clinicaId, "nina.instrucoes.publicar");

    // FASE 2 — marcador desconhecido é reprovado ANTES de mexer na versão
    // ativa: a publicação nem chega ao banco e a versão em uso continua.
    const validacao = validarTemplateInstrucoes(data.escopo, data.conteudo);
    if (!validacao.ok) throw new Error(validacao.mensagem);

    // FASE 1 — identidade do atendimento: bloco duplicado, incompleto ou fora
    // de formato reprova ANTES de tocar na versão ativa. Bloco ausente NÃO
    // bloqueia (versões antigas seguem sem identidade e nada é inferido).
    if (data.escopo === "whatsapp") {
      const identidade = validarIdentidadeParaPublicacao(data.conteudo);
      if (!identidade.ok) throw new Error(identidade.mensagem);
    }


    const { data: anterior } = await supabase
      .from(TAB)
      .select("versao")
      .is("clinica_id", null)
      .eq("escopo", data.escopo)
      .eq("status", "publicada")
      .maybeSingle();

    const { data: nova, error } = await supabase.rpc("nina_instrucoes_publicar", {
      p_escopo: data.escopo,
      p_conteudo: data.conteudo,
      p_comentario: data.comentario ?? null,
    });
    if (error) throw new Error(error.message);
    // FASE 4 — a próxima execução da Nina já relê do banco nesta instância;
    // nas demais, o TTL curto do cache fecha a janela.
    const { invalidarCacheInstrucoes } = await import("@/lib/nina/instrucoes-runtime.server");
    invalidarCacheInstrucoes(data.escopo as "whatsapp" | "painel_interno");
    await auditar({
      clinicaId: data.clinicaId,
      userId,
      acao: data.restauradaDe
        ? "NINA_INSTRUCOES_RESTAURACAO"
        : "NINA_INSTRUCOES_PUBLICACAO",
      escopo: data.escopo,
      versaoAnterior: (anterior as { versao: number } | null)?.versao ?? null,
      versaoNova: (nova as VersaoInstrucoes)?.versao ?? null,
      comentario: data.comentario ?? null,
      restauradaDe: data.restauradaDe ?? null,
    });
    return nova as VersaoInstrucoes;
  });
