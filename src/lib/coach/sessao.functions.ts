/**
 * Prova e treino do Coach conduzidos pelo servidor.
 *
 * O navegador não grava mais nota, acerto, duração nem mensagem de treino: ele
 * só pede para começar, manda a resposta e pede para encerrar. A alternativa
 * correta e a explicação ficam guardadas no servidor até a pessoa responder.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contextoDataAtual } from "./data-atual";
import {
  aplicarResposta,
  corrigirProva,
  duracaoSegundos,
  notaValida,
  sanitizarQuestoes,
  type QuestaoCompleta,
  type QuestaoSegura,
} from "./sessao-calculo";
import type { FeedbackProva } from "./prova.server";
import type {
  RoleplayFeedback,
  RoleplayScenario,
  TurnoAvaliacao,
} from "./roleplay-tipos";

export type { ProvaQuestao, FeedbackProva, FeedbackItem } from "./prova.server";
export type {
  RoleplayScenario,
  RoleplayFeedback,
  RoleplayTurn,
  TurnoAvaliacao,
} from "./roleplay-tipos";
export type { QuestaoSegura } from "./sessao-calculo";

const uuid = z.string().uuid();

/* ============================== PROVA ============================== */

export type ProvaEmAndamento = {
  provaId: string;
  questoes: QuestaoSegura[];
  respostas: number[];
};

export type ResultadoFinalProva = {
  acertos: number;
  total: number;
  nota: number;
  feedback: FeedbackProva;
  gabarito: { correta: number; explicacao: string }[];
};

/** Começa (ou retoma) a prova da pessoa. As respostas certas ficam no servidor. */
export const iniciarProva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        atendente: z.string().min(1).max(120),
        alvoUserId: uuid.nullish(),
        quantidade: z.number().int().min(3).max(15).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProvaEmAndamento> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");

    const a = await s.admin();
    const dono = await s.donoDaLinha(db, data.clinicaId, context.userId, data.alvoUserId);

    const aberta = await s.provaEmAndamentoDe(a, data.clinicaId, dono);
    if (aberta) {
      return {
        provaId: aberta.id,
        questoes: sanitizarQuestoes(aberta.questoes ?? []),
        respostas: Array.isArray(aberta.respostas) ? aberta.respostas : [],
      };
    }

    const exemplos = await s.exemplosDaAtendente(db, data.clinicaId, dono, data.atendente);
    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "prova-gerar",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, "", 20_000);
    const { GATEWAY, MODEL, SYSTEM_PROMPT, PROVA_TOOL, authHeaders, buildUserPrompt, normalize } =
      await import("./prova.server");

    const quantidade = data.quantidade ?? 8;
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${contextoDataAtual()}\n\n${SYSTEM_PROMPT}` },
          {
            role: "user",
            content: buildUserPrompt(
              data.atendente,
              quantidade,
              exemplos,
              scriptsTexto,
              tabelaTexto,
            ),
          },
        ],
        tools: [PROVA_TOOL],
        tool_choice: { type: "function", function: { name: "registrar_prova" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "prova-gerar");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Não foi possível montar a prova agora. Tente novamente.");
    const gerada = normalize(JSON.parse(args), quantidade);
    const questoes = gerada.questoes as unknown as QuestaoCompleta[];

    const { data: linha, error } = await a
      .from("coach_provas")
      .insert({
        clinica_id: data.clinicaId,
        user_id: dono,
        atendente: data.atendente,
        status: "em_andamento",
        questoes,
        respostas: questoes.map(() => -1),
        acertos: 0,
        total: questoes.length,
        nota: 0,
      })
      .select("id")
      .single();
    if (error || !linha) throw new Error("Não foi possível abrir a prova agora.");

    return {
      provaId: (linha as { id: string }).id,
      questoes: sanitizarQuestoes(questoes),
      respostas: questoes.map(() => -1),
    };
  });

/** Guarda a resposta e devolve só o retorno daquela questão. */
export const responderQuestao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        provaId: uuid,
        indice: z.number().int().min(0).max(19),
        alternativa: z.number().int().min(0).max(5),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ correta: boolean; explicacao: string; alternativaCerta: number }> => {
      const guard = await import("./guard.server");
      const s = await import("./sessao.server");
      const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
      await guard.garantirAcessoCoach(db, data.clinicaId, "read");

      const a = await s.admin();
      const prova = await s.lerProva(a, data.provaId);
      await s.conferirDono(db, prova, context.userId, data.clinicaId);
      if (!prova || prova.status !== "em_andamento") throw new Error("Esta prova já foi encerrada.");

      const questoes = prova.questoes ?? [];
      const q = questoes[data.indice];
      if (!q) throw new Error("Questão inválida.");
      const respostas = aplicarResposta(
        prova.respostas,
        data.indice,
        data.alternativa,
        questoes.length,
        q.alternativas.length,
      );
      await a.from("coach_provas").update({ respostas }).eq("id", prova.id);

      return {
        correta: data.alternativa === Number(q.correta),
        explicacao: q.explicacao ?? "",
        alternativaCerta: Number(q.correta),
      };
    },
  );

/** Corrige, dá a nota, gera o feedback e fecha a prova — tudo no servidor. */
export const finalizarProva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: uuid, provaId: uuid }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ResultadoFinalProva> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");

    const a = await s.admin();
    const prova = await s.lerProva(a, data.provaId);
    await s.conferirDono(db, prova, context.userId, data.clinicaId);
    if (!prova) throw new Error("Prova não encontrada.");

    const questoes = prova.questoes ?? [];
    const respostas = Array.isArray(prova.respostas) ? prova.respostas : [];
    const gabarito = questoes.map((q) => ({
      correta: Number(q.correta),
      explicacao: q.explicacao ?? "",
    }));

    if (prova.status !== "em_andamento" && prova.feedback) {
      const jaFeito = corrigirProva(questoes, respostas);
      return { ...jaFeito, feedback: prova.feedback as FeedbackProva, gabarito };
    }

    const { acertos, total, nota } = corrigirProva(questoes, respostas);

    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "prova-feedback",
      atendente: prova.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, "", 20_000);
    const {
      GATEWAY,
      MODEL,
      FEEDBACK_SYSTEM_PROMPT,
      FEEDBACK_TOOL,
      authHeaders,
      buildFeedbackPrompt,
      normalizeFeedback,
    } = await import("./prova.server");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${contextoDataAtual()}\n\n${FEEDBACK_SYSTEM_PROMPT}` },
          {
            role: "user",
            content: buildFeedbackPrompt(
              prova.atendente,
              questoes,
              respostas,
              tabelaTexto,
              scriptsTexto,
            ),
          },
        ],
        tools: [FEEDBACK_TOOL],
        tool_choice: { type: "function", function: { name: "registrar_feedback" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "prova-feedback");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Não foi possível montar o resultado agora. Tente novamente.");
    const feedback = normalizeFeedback(JSON.parse(args), questoes.length);

    await a
      .from("coach_provas")
      .update({
        acertos,
        total,
        nota,
        feedback,
        status: "concluida",
        finalizada_at: new Date().toISOString(),
      })
      .eq("id", prova.id);

    return { acertos, total, nota, feedback, gabarito };
  });

/* ============================== TREINO ============================== */

export type TreinoIniciado = {
  sessionId: string;
  cenario: RoleplayScenario;
  pontos_fracos: string[];
};

export type TreinoTurno = {
  finalizar: boolean;
  resposta_cliente?: string;
  avaliacao_turno?: TurnoAvaliacao;
};

export type TreinoEncerrado = {
  feedback: RoleplayFeedback;
  duracao_seg: number;
  expirado?: boolean;
};

const dificuldadeSchema = z.enum(["facil", "medio", "dificil"]).optional();

/** Abre o treino: cenário, perfil do paciente e primeira fala. */
export const iniciarTreino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        atendente: z.string().min(1).max(120),
        alvoUserId: uuid.nullish(),
        modo: z.enum(["texto", "voz"]),
        dificuldade: dificuldadeSchema,
        contexto: z.string().max(1200).optional(),
        evitar: z.array(z.string().max(300)).max(60).optional(),
        seed: z.string().max(40).optional(),
        simulacaoGestor: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<TreinoIniciado> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");

    const a = await s.admin();
    await s.expirarTreinosAntigos(a);
    const dono = await s.donoDaLinha(db, data.clinicaId, context.userId, data.alvoUserId);
    const simulacao = await s.simulacaoPermitida(db, data.clinicaId, data.simulacaoGestor);

    const { fracos, exemplos } = await s.pontosFracosDaAtendente(
      db,
      data.clinicaId,
      dono,
      data.atendente,
    );

    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-start",
      atendente: data.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, data.contexto ?? "", 10_000);
    const rp = await import("./roleplay-prompt.server");

    const res = await fetch(rp.GATEWAY, {
      method: "POST",
      headers: rp.authHeaders(),
      body: JSON.stringify({
        model: rp.MODEL,
        messages: rp.buildStartMessages({
          atendente: data.atendente,
          pontos_fracos: fracos,
          contexto: data.contexto,
          evitar: data.evitar,
          seed: data.seed,
          dificuldade: data.dificuldade,
          exemplos: exemplos.map((e) => ({
            resumo: e.resumo,
            transcricao: e.transcricao,
            pontos_negativos: e.pontos_negativos,
            frases_negativas: (e.frases ?? [])
              .filter((f) => f.tipo !== "positiva")
              .map((f) => f.trecho),
          })),
          scriptsTexto,
          tabelaTexto,
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
    const cenario = JSON.parse(args) as RoleplayScenario;

    const { data: linha, error } = await a
      .from("coach_roleplay_sessions")
      .insert({
        clinica_id: data.clinicaId,
        user_id: dono,
        atendente: data.atendente,
        status: "em_andamento",
        modo: data.modo,
        cenario: cenario.cenario,
        perfil_cliente: cenario.perfil_cliente,
        pontos_fracos: fracos,
        mensagens: [{ role: "cliente", content: cenario.primeira_mensagem }],
        nota: 0,
        duracao_seg: 0,
        simulacao_gestor: simulacao,
      })
      .select("id")
      .single();
    if (error || !linha) throw new Error("Não foi possível abrir o treino agora.");

    return { sessionId: (linha as { id: string }).id, cenario, pontos_fracos: fracos };
  });

/** Um turno do treino: grava a fala da atendente e devolve a do paciente. */
export const responderTreino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: uuid,
        sessionId: uuid,
        texto: z.string().min(1).max(4000),
        dificuldade: dificuldadeSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<TreinoTurno> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");

    const a = await s.admin();
    const sessao = await s.lerTreino(a, data.sessionId);
    await s.conferirDono(db, sessao, context.userId, data.clinicaId);
    if (!sessao || sessao.status !== "em_andamento")
      throw new Error("Este treino já foi encerrado. Comece um novo.");

    const historico = [
      ...(Array.isArray(sessao.mensagens) ? sessao.mensagens : []),
      { role: "atendente" as const, content: data.texto },
    ];

    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-reply",
      atendente: sessao.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, sessao.cenario ?? "", 10_000);
    const rp = await import("./roleplay-prompt.server");

    const res = await fetch(rp.GATEWAY, {
      method: "POST",
      headers: rp.authHeaders(),
      body: JSON.stringify({
        model: rp.MODEL,
        messages: rp.buildReplyMessages({
          atendente: sessao.atendente,
          pontos_fracos: sessao.pontos_fracos ?? [],
          cenario: sessao.cenario ?? "",
          perfil_cliente: sessao.perfil_cliente ?? "",
          history: historico,
          dificuldade: data.dificuldade,
          scriptsTexto,
          tabelaTexto,
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
    const turno = JSON.parse(args) as {
      finalizar?: boolean;
      resposta_cliente?: string;
      avaliacao_turno?: TurnoAvaliacao;
    };

    const mensagens = turno.resposta_cliente
      ? [...historico, { role: "cliente" as const, content: turno.resposta_cliente }]
      : historico;
    await a.from("coach_roleplay_sessions").update({ mensagens }).eq("id", sessao.id);

    return {
      finalizar: Boolean(turno.finalizar),
      resposta_cliente: turno.resposta_cliente,
      avaliacao_turno: turno.avaliacao_turno,
    };
  });

/** Encerra o treino: nota, feedback e duração calculados aqui. */
export const encerrarTreino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ clinicaId: uuid, sessionId: uuid, dificuldade: dificuldadeSchema })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<TreinoEncerrado> => {
    const guard = await import("./guard.server");
    const s = await import("./sessao.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");

    const a = await s.admin();
    const sessao = await s.lerTreino(a, data.sessionId);
    await s.conferirDono(db, sessao, context.userId, data.clinicaId);
    if (!sessao) throw new Error("Treino não encontrado.");
    if (sessao.status !== "em_andamento") throw new Error("Este treino já foi encerrado.");

    const duracao = duracaoSegundos(sessao.created_at);
    const historico = Array.isArray(sessao.mensagens) ? sessao.mensagens : [];

    const usoId = await guard.registrarUsoIA(db, {
      clinicaId: data.clinicaId,
      funcao: "roleplay-feedback",
      atendente: sessao.atendente,
    });
    const config = await guard.configDaClinica(db, data.clinicaId);
    const scriptsTexto = guard.scriptsEmTexto(config.scripts);
    const tabelaTexto = guard.baseParaPrompt(config, sessao.cenario ?? "", 10_000);
    const rp = await import("./roleplay-prompt.server");

    const res = await fetch(rp.GATEWAY, {
      method: "POST",
      headers: rp.authHeaders(),
      body: JSON.stringify({
        model: rp.MODEL,
        messages: rp.buildReplyMessages({
          atendente: sessao.atendente,
          pontos_fracos: sessao.pontos_fracos ?? [],
          cenario: sessao.cenario ?? "",
          perfil_cliente: sessao.perfil_cliente ?? "",
          history: historico,
          dificuldade: data.dificuldade,
          encerrar: true,
          scriptsTexto,
          tabelaTexto,
        }),
        tools: [rp.REPLY_TOOL],
        tool_choice: { type: "function", function: { name: "responder_cliente" } },
      }),
    });
    if (!res.ok) await guard.erroGenericoIA(res, "roleplay-feedback");
    const json = await res.json();
    await guard.fecharUsoIA(db, usoId, json);
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Não foi possível encerrar o treino agora. Tente novamente.");
    const parsed = JSON.parse(args) as { feedback?: Partial<RoleplayFeedback> };
    const bruto = parsed.feedback ?? {};

    const feedback: RoleplayFeedback = {
      nota: notaValida(bruto.nota),
      agendou: Boolean(bruto.agendou),
      aderencia_script: Math.max(0, Math.min(100, Number(bruto.aderencia_script) || 0)),
      resumo: String(bruto.resumo ?? "").slice(0, 2000),
      acertos: (Array.isArray(bruto.acertos) ? bruto.acertos : []).map((x) => String(x)),
      melhorias: (Array.isArray(bruto.melhorias) ? bruto.melhorias : []).map((x) => String(x)),
      dica_pratica: String(bruto.dica_pratica ?? "").slice(0, 1000),
    };

    await a
      .from("coach_roleplay_sessions")
      .update({
        status: "concluida",
        finalizada_at: new Date().toISOString(),
        duracao_seg: duracao,
        nota: feedback.nota,
        agendou: feedback.agendou,
        aderencia_script: feedback.aderencia_script,
        resumo: feedback.resumo,
        acertos: feedback.acertos,
        melhorias: feedback.melhorias,
        dica_pratica: feedback.dica_pratica,
      })
      .eq("id", sessao.id);

    return { feedback, duracao_seg: duracao };
  });
