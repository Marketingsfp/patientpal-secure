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

/** Padrão global (clinica_id NULL): publicada ativa + rascunho mais recente por escopo. */
export const carregarInstrucoesNina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstrucoesEscopo[]> => {
    const { supabase } = context as { supabase: any };
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
        escopo: z.enum(ESCOPOS),
        conteudo: z.string().min(1).max(60000),
        comentario: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<VersaoInstrucoes> => {
    const { supabase, userId } = context as { supabase: any; userId: string };

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
    return criado as VersaoInstrucoes;
  });
