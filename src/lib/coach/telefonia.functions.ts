/**
 * Diagnóstico da telefonia Sufficit no Coach. Só gestão (escrita) do Coach.
 * Nada aqui grava a amostra: ela volta para a tela e só.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analisarTextoNoServidor, type AnalysisResult } from "./analyze.functions";

const entrada = (data: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(data);

export const testarConexaoTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entrada)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    const [config, tamanhoToken, ping] = await Promise.all([
      s.estadoConfigSufficit(data.clinicaId),
      s.tamanhoTokenSufficit(data.clinicaId),
      s.pingSufficit(data.clinicaId),
    ]);
    return { config, tamanhoToken, ping };
  });

export const amostrarChamadasTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.amostraChamadasSufficit(data.clinicaId, 5, { start: data.start, end: data.end });
  });

// Nome da chave é parâmetro, mas restrito à lista fechada do servidor.
const chaveSegredo = z.enum(["sufficit_api_token"]);

export const estadoSegredoTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: z.string().uuid(), chave: chaveSegredo }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.estadoSegredo(data.clinicaId, data.chave);
  });

export const salvarTokenTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = z
      .object({
        clinicaId: z.string().uuid(),
        chave: chaveSegredo,
        valor: z.string().trim().min(1).max(8000),
      })
      .safeParse(data);
    // Mensagem própria: o erro do zod poderia citar o valor recebido.
    if (!r.success) throw new Error("Dados inválidos. Confira o token e tente novamente.");
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.salvarSegredo(data.clinicaId, data.chave, data.valor);
  });

export const removerTokenTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clinicaId: z.string().uuid(), chave: chaveSegredo }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.removerSegredo(data.clinicaId, data.chave);
  });

/** Estado das chaves nesta clínica + outras clínicas com chaves (sem valores). */
export const estadoConfigTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entrada)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    const userId = await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    const [config, tamanhoToken, outras] = await Promise.all([
      s.estadoConfigSufficit(data.clinicaId),
      s.tamanhoTokenSufficit(data.clinicaId),
      s.outrasClinicasComSufficit(db, userId, data.clinicaId),
    ]);
    return { config, tamanhoToken, outras };
  });

const periodoObrigatorio = (data: unknown) =>
  z
    .object({
      clinicaId: z.string().uuid(),
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .parse(data);

export const importarChamadasTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(periodoObrigatorio)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.importarChamadasSufficit(data.clinicaId, { start: data.start, end: data.end });
  });

/** Ligações já importadas no período, lidas com a RLS de quem pediu. */
export const listarChamadasTelefonia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(periodoObrigatorio)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const { data: linhas, count, error } = await context.supabase
      .from("tel_chamadas")
      .select(
        "id, inicio, duracao_seg, tarifado_seg, direcao, situacao, modelo, origem_numero, destino_numero, discado, did",
        { count: "exact" },
      )
      .eq("clinica_id", data.clinicaId)
      .gte("inicio", data.start)
      .lte("inicio", data.end)
      .order("inicio", { ascending: false })
      .limit(500);
    if (error) throw new Error("Não foi possível ler as ligações importadas.");
    return { total: count ?? 0, linhas: linhas ?? [] };
  });

/* ------------------------------------------------------------------ */
/* Aba "Análise": quem ficou sem resposta + transcrição e IA.          */
/* ------------------------------------------------------------------ */

/** Ligações do período (todas), lidas com a RLS de quem pediu. */
export const ligacoesParaAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(periodoObrigatorio)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const sb = context.supabase;
    const { data: linhas, error } = await sb
      .from("tel_chamadas")
      .select("externo_id, inicio, direcao, situacao, origem_numero, duracao_seg")
      .eq("clinica_id", data.clinicaId)
      .gte("inicio", data.start)
      .lte("inicio", data.end)
      .order("inicio", { ascending: false })
      .limit(5000);
    if (error) throw new Error("Não foi possível ler as ligações.");
    const ids = (linhas ?? [])
      .filter((l) => (l.situacao ?? "").toUpperCase() === "ANSWERED")
      .map((l) => l.externo_id);
    const transcritas = new Map<string, number>();
    const analises = new Map<string, { pontuacao: number | null; criado_em: string; resultado: unknown }>();
    for (let i = 0; i < ids.length; i += 150) {
      const lote = ids.slice(i, i + 150);
      const [t, a] = await Promise.all([
        sb
          .from("tel_transcricoes")
          .select("externo_id, caracteres")
          .eq("clinica_id", data.clinicaId)
          .in("externo_id", lote),
        sb
          .from("tel_analises")
          .select("externo_id, pontuacao, criado_em, resultado")
          .eq("clinica_id", data.clinicaId)
          .in("externo_id", lote)
          .order("criado_em", { ascending: false }),
      ]);
      for (const r of t.data ?? []) transcritas.set(r.externo_id, r.caracteres);
      for (const r of a.data ?? [])
        if (!analises.has(r.externo_id))
          analises.set(r.externo_id, {
            pontuacao: r.pontuacao == null ? null : Number(r.pontuacao),
            criado_em: r.criado_em,
            resultado: r.resultado,
          });
    }
    return {
      linhas: linhas ?? [],
      transcritas: Object.fromEntries(transcritas),
      analises: Object.fromEntries(analises) as Record<
        string,
        { pontuacao: number | null; criado_em: string; resultado: AnalysisResult }
      >,
    };
  });

const porLigacao = (data: unknown) =>
  z.object({ clinicaId: z.string().uuid(), externoId: z.string().trim().min(1).max(80) }).parse(data);

export const buscarTranscricaoLigacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(porLigacao)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const s = await import("./telefonia-sufficit.server");
    return s.buscarTranscricaoSufficit(data.clinicaId, data.externoId);
  });

/** Texto da transcrição guardada, para a gestão ler antes de analisar. */
export const lerTranscricaoLigacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(porLigacao)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    const { data: t } = await context.supabase
      .from("tel_transcricoes")
      .select("texto, modelo, caracteres")
      .eq("clinica_id", data.clinicaId)
      .eq("externo_id", data.externoId)
      .maybeSingle();
    return t ?? null;
  });

/** Quanto ainda dá para usar da IA do Coach hoje (mesma regra da cota no banco). */
export const cotaIACoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entrada)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    const userId = await guard.garantirAcessoCoach(db, data.clinicaId, "read");
    // Igual a coach_registrar_uso_ia: data de São Paulo à meia-noite UTC.
    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const desde = `${dia}T00:00:00Z`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [cfg, eu, clinica] = await Promise.all([
      supabaseAdmin
        .from("coach_config_clinica")
        .select("limite_ia_usuario, limite_ia_clinica")
        .eq("clinica_id", data.clinicaId)
        .maybeSingle(),
      supabaseAdmin
        .from("coach_uso_ia")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .eq("user_id", userId)
        .gte("created_at", desde),
      supabaseAdmin
        .from("coach_uso_ia")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .gte("created_at", desde),
    ]);
    const limUser = Number(cfg.data?.limite_ia_usuario ?? 60) || 60;
    const limClin = Number(cfg.data?.limite_ia_clinica ?? 600) || 600;
    return {
      restaUsuario: Math.max(0, limUser - (eu.count ?? 0)),
      limiteUsuario: limUser,
      restaClinica: Math.max(0, limClin - (clinica.count ?? 0)),
      limiteClinica: limClin,
    };
  });

export const analisarLigacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(porLigacao)
  .handler(async ({ data, context }) => {
    const guard = await import("./guard.server");
    const db = context.supabase as unknown as import("./guard.server").ClienteCoach;
    const userId = await guard.garantirAcessoCoach(db, data.clinicaId, "write");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tel_transcricoes")
      .select("texto")
      .eq("clinica_id", data.clinicaId)
      .eq("origem", "sufficit")
      .eq("externo_id", data.externoId)
      .maybeSingle();
    if (!t?.texto || t.texto.trim().length < 20) {
      throw new Error("Busque a transcrição desta ligação antes de analisar.");
    }
    const resultado = await analisarTextoNoServidor(db, {
      clinicaId: data.clinicaId,
      text: t.texto.slice(0, 30_000),
      semFalantes: true,
    });
    const { error } = await supabaseAdmin.from("tel_analises").insert({
      clinica_id: data.clinicaId,
      origem: "sufficit",
      externo_id: data.externoId,
      resultado: resultado as never,
      pontuacao: Number(resultado.pontuacao) || null,
      criado_por: userId,
    });
    if (error) console.error("[coach] gravar análise da ligação:", error.code ?? "erro");
    return resultado;
  });
