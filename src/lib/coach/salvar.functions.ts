/**
 * Gravação do resultado final da prova e do treino do Coach pelo servidor.
 *
 * O banco não aceita mais gravação dessas tabelas direto do navegador, e as
 * telas ainda montavam o resultado no navegador — por isso nada era salvo.
 * Estas funções conferem acesso ao módulo e o dono da linha antes de gravar.
 * A nota da prova é recalculada aqui a partir das questões e respostas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { corrigirProva, type QuestaoCompleta } from "./sessao-calculo";

const uuid = z.string().uuid();
const json = z.unknown();

export const salvarSessaoRoleplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        alvoUserId: uuid.nullish(),
        atendente: z.string().min(1).max(120),
        simulacaoGestor: z.boolean().optional(),
        nota: z.number().min(0).max(10),
        resumo: z.string().max(4000).nullish(),
        acertos: z.array(z.string().max(1000)).max(30).optional(),
        melhorias: z.array(z.string().max(1000)).max(30).optional(),
        dicaPratica: z.string().max(2000).nullish(),
        cenario: z.string().max(2000).nullish(),
        perfilCliente: z.string().max(2000).nullish(),
        pontosFracos: json,
        mensagens: z.array(json).max(400),
        duracaoSeg: z.number().int().min(0).max(24 * 3600).nullish(),
        modo: z.enum(["texto", "voz"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const dono = await s.donoDaLinha(db, data.clinicaId, context.userId, data.alvoUserId);
    const simulacao = await s.simulacaoPermitida(db, data.clinicaId, data.simulacaoGestor);
    const a = await s.admin();
    const { error } = await a.from("coach_roleplay_sessions").insert({
      clinica_id: data.clinicaId,
      user_id: dono,
      atendente: data.atendente,
      simulacao_gestor: simulacao,
      nota: data.nota,
      resumo: data.resumo ?? null,
      acertos: data.acertos ?? [],
      melhorias: data.melhorias ?? [],
      dica_pratica: data.dicaPratica ?? null,
      cenario: data.cenario ?? null,
      perfil_cliente: data.perfilCliente ?? null,
      pontos_fracos: data.pontosFracos ?? [],
      mensagens: data.mensagens,
      duracao_seg: data.duracaoSeg ?? null,
      modo: data.modo,
    });
    if (error) {
      console.error("[coach] salvarSessaoRoleplay:", error.message);
      throw new Error("Não foi possível salvar o treino.");
    }
    return { ok: true as const };
  });

const questaoSchema = z.object({
  pergunta: z.string().max(1200),
  alternativas: z.array(z.string().max(600)).min(2).max(6),
  correta: z.number().int().min(0).max(5),
  explicacao: z.string().max(1200).optional(),
  origem: z.string().max(300).optional(),
});

export const salvarProvaConcluida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        alvoUserId: uuid.nullish(),
        atendente: z.string().min(1).max(120),
        simulacaoGestor: z.boolean().optional(),
        questoes: z.array(questaoSchema).min(1).max(20),
        respostas: z.array(z.number().int().min(-1).max(10)).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const dono = await s.donoDaLinha(db, data.clinicaId, context.userId, data.alvoUserId);
    const simulacao = await s.simulacaoPermitida(db, data.clinicaId, data.simulacaoGestor);
    const questoes = data.questoes as unknown as QuestaoCompleta[];
    const { acertos, total, nota } = corrigirProva(questoes, data.respostas);
    const a = await s.admin();
    const { data: linha, error } = await a
      .from("coach_provas")
      .insert({
        clinica_id: data.clinicaId,
        user_id: dono,
        atendente: data.atendente,
        simulacao_gestor: simulacao,
        status: "concluida",
        nota,
        acertos,
        total,
        questoes,
        respostas: data.respostas,
      })
      .select("id")
      .single();
    if (error || !linha) {
      console.error("[coach] salvarProvaConcluida:", error?.message);
      throw new Error("Não foi possível salvar o resultado da prova.");
    }
    return { id: (linha as { id: string }).id };
  });

export const salvarFeedbackProva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: uuid, provaId: uuid, feedback: json }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const a = await s.admin();
    const prova = await s.lerProva(a, data.provaId);
    await s.conferirDono(db, prova, context.userId, data.clinicaId);
    await a.from("coach_provas").update({ feedback: data.feedback }).eq("id", data.provaId);
    return { ok: true as const };
  });
