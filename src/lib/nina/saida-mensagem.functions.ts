/**
 * O QUE É CADA BOLHA DA NINA (leitura para a tela de homologação e a Inbox).
 *
 * Responde, por mensagem entregue e sem adivinhar: é resposta avaliada, aviso
 * operacional do sistema, mensagem sem avaliação, ou texto alterado depois da
 * avaliação? E devolve o vínculo REAL (execução, entrega, encaminhamento) para
 * os detalhes técnicos.
 *
 * Nada é associado por horário próximo nem por semelhança de texto: só por
 * identificadores gravados (mensagem, execução, conversa) e por impressão
 * digital do conteúdo. Registro antigo e incompleto é declarado como tal.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import type { ClasseSaida } from "./confidence/classificacao-saida";
export type AvaliacaoDaSaidaView = {
  decisaoId: string | null;
  score: number | null;
  nivel: string | null;
  representacao: string | null;
  textoHash: string | null;
  criadoEm: string | null;
  /** Esta avaliação é do conteúdo realmente entregue nesta bolha? */
  desteTexto: boolean;
};

export type SaidaMensagemView = {
  mensagemId: string;
  clinicaId: string;
  conversaId: string | null;
  /** Autoria/vínculo oficial conferidos no servidor. Não é inferido pelo conteúdo. */
  inspecionavel: boolean;
  execucaoId: string | null;
  ambiente: "producao" | "homologacao";
  classe: ClasseSaida;
  explicacao: string;
  limitacao: string | null;
  /** Origem declarada da mensagem (resposta da Nina, aviso do sistema…). */
  origem: string | null;
  textoEntregue: string | null;
  textoEntregueHash: string | null;
  /** Por que este texto substituiu o anterior, quando houve substituição. */
  motivoSubstituicao: string | null;
  entrega: {
    estado: string | null;
    representacao: string | null;
    transporteId: string | null;
  } | null;
  encaminhamento: { protocolo: string | null; estado: string | null; estadoRotulo: string } | null;
  avaliacoes: AvaliacaoDaSaidaView[];
  /** Score aplicável a ESTE conteúdo (null quando não há vínculo conferido). */
  score: number | null;
  nivel: string | null;
};

export const saidasDasMensagens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid().nullable().optional(),
        mensagemIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<SaidaMensagemView[]> => {
    const { data: membro, error } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (error || !membro) throw new Error("Sem acesso a esta clínica.");
    const { carregarSaidasDasMensagens } = await import("./saida-mensagem.server");
    return carregarSaidasDasMensagens(context.supabase, data);
  });

/** Inspeção compartilhada: leitura com as permissões do próprio usuário nos dois ambientes. */
export const detalhesDaMensagemNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: membro, error } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (error || !membro) throw new Error("Sem acesso a esta clínica.");
    const { data: conversa, error: erroConversa } = await context.supabase
      .from("atend_conversas")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.conversaId)
      .maybeSingle();
    if (erroConversa || !conversa)
      throw new Error("Conversa não encontrada ou sem permissão de acesso.");
    const { carregarDetalhesMensagem } = await import("./detalhes-mensagem.server");
    const { NINA_RUNTIME_VERSION } = await import("./runtime-version");
    const r = await carregarDetalhesMensagem(context.supabase, data);
    type Json = import("@/integrations/supabase/types").Json;
    return {
      ...r,
      runtimeAtual: NINA_RUNTIME_VERSION,
      execucao: r.execucao as Json,
      etapas: r.etapas as Json[],
      eventos: r.eventos as Json[],
      registrosComplementares: r.registrosComplementares as Json,
    };
  });
