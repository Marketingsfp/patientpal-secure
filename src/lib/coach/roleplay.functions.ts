/**
 * Ponte temporária do treino antigo.
 *
 * A tela do treino ainda chama estas duas funções enquanto é migrada para o
 * fluxo novo (`iniciarTreino` / `responderTreino` / `encerrarTreino` em
 * `sessao.functions.ts`), onde o servidor guarda a conversa e fecha a nota.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  RoleplayScenario,
  RoleplayTurn,
} from "./roleplay-tipos";

export type {
  RoleplayScenario,
  RoleplayFeedback,
  RoleplayTurn,
  TurnoAvaliacao,
} from "./roleplay-tipos";

const dificuldade = z.enum(["facil", "medio", "dificil"]).optional();

const StartSchema = z.object({
  clinicaId: z.string().uuid(),
  atendente: z.string().min(1).max(120),
  pontos_fracos: z.array(z.string().max(500)).max(12),
  contexto: z.string().max(1200).optional(),
  evitar: z.array(z.string().max(300)).max(60).optional(),
  seed: z.string().max(40).optional(),
  dificuldade,
  exemplos: z
    .array(
      z.object({
        resumo: z.string().max(2000).optional(),
        transcricao: z.string().max(8000).optional(),
        pontos_negativos: z.array(z.string().max(500)).max(12).optional(),
        frases_negativas: z.array(z.string().max(800)).max(12).optional(),
      }),
    )
    .max(8)
    .optional(),
});

const ReplySchema = z.object({
  clinicaId: z.string().uuid(),
  atendente: z.string().min(1).max(120),
  pontos_fracos: z.array(z.string().max(500)).max(12),
  cenario: z.string().max(2000),
  perfil_cliente: z.string().max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["cliente", "atendente"]),
        content: z.string().max(4000),
      }),
    )
    .max(200),
  dificuldade,
  encerrar: z.boolean().optional(),
});

export const startRoleplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartSchema.parse(data))
  .handler(async ({ data, context }): Promise<RoleplayScenario> => {
    const guard = await import("./guard.server");
    const rp = await import("./roleplay-prompt.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-start",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const res = await fetch(rp.GATEWAY, {
      method: "POST",
      headers: rp.authHeaders(),
      body: JSON.stringify({
        model: rp.MODEL,
        messages: rp.buildStartMessages({
          ...data,
          scriptsTexto: guard.scriptsEmTexto(config.scripts),
          tabelaTexto: guard.baseParaPrompt(config, data.contexto ?? "", 10_000),
        }),
        tools: [rp.START_TOOL],
        tool_choice: { type: "function", function: { name: "iniciar_roleplay" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "roleplay-start");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Não foi possível criar o treino agora. Tente novamente.");
    return JSON.parse(args) as RoleplayScenario;
  });

export const roleplayReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReplySchema.parse(data))
  .handler(async ({ data, context }): Promise<RoleplayTurn> => {
    const guard = await import("./guard.server");
    const rp = await import("./roleplay-prompt.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: data.encerrar ? "roleplay-feedback" : "roleplay-reply",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const res = await fetch(rp.GATEWAY, {
      method: "POST",
      headers: rp.authHeaders(),
      body: JSON.stringify({
        model: rp.MODEL,
        messages: rp.buildReplyMessages({
          ...data,
          scriptsTexto: guard.scriptsEmTexto(config.scripts),
          tabelaTexto: guard.baseParaPrompt(config, data.cenario, 10_000),
        }),
        tools: [rp.REPLY_TOOL],
        tool_choice: { type: "function", function: { name: "responder_cliente" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "roleplay-reply");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Não foi possível responder agora. Tente novamente.");
    return JSON.parse(args) as RoleplayTurn;
  });
