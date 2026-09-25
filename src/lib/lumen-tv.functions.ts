/**
 * Integração com as TVs da recepção (LUMEN).
 *
 * O token nunca vai ao navegador: a tabela lumen_tv_config não tem acesso
 * direto para usuários logados. Estas funções conferem, pelo usuário do token
 * verificado, se ele administra a clínica (can_manage_clinica) e só então
 * leem/gravam com a chave de serviço, devolvendo apenas os 4 últimos
 * caracteres do token.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const URL_PADRAO = "https://display-mate.lovable.app/api/public/calls";

type Ctx = { supabase: { rpc: (...a: never[]) => unknown }; userId: string };

async function exigirGestor(context: unknown, clinicaId: string) {
  const c = context as Ctx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (c.supabase as any).rpc("can_manage_clinica", {
    _user_id: c.userId,
    _clinica_id: clinicaId,
  });
  if (error || !data) throw new Error("Apenas quem administra a clínica pode fazer isso.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

const clinicaInput = z.object({ clinicaId: z.string().uuid() });

export const obterLumenConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => clinicaInput.parse(d))
  .handler(async ({ data, context }) => {
    await exigirGestor(context, data.clinicaId);
    const db = await admin();
    const { data: cfg } = await db
      .from("lumen_tv_config")
      .select("url, token, pair_codes, enviar_nome, ativo")
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    const { data: envios } = await db
      .from("lumen_tv_envios")
      .select("id, codigo, enviado_em, request_id")
      .eq("clinica_id", data.clinicaId)
      .order("enviado_em", { ascending: false })
      .limit(20);
    const ids = (envios ?? [])
      .map((e: { request_id: number | null }) => e.request_id)
      .filter(Boolean);
    const respostas: Record<string, { status: number | null; erro: string | null }> = {};
    if (ids.length) {
      const { data: r } = await db.rpc("lumen_tv_respostas", { _ids: ids });
      for (const x of r ?? [])
        respostas[String(x.id)] = { status: x.status_code, erro: x.error_msg };
    }
    return {
      config: cfg
        ? {
            url: cfg.url as string,
            tokenFim: String(cfg.token).slice(-4),
            pairCodes: (cfg.pair_codes as string[] | null) ?? [],
            enviarNome: !!cfg.enviar_nome,
            ativo: !!cfg.ativo,
          }
        : null,
      envios: (envios ?? []).map(
        (e: {
          id: string;
          codigo: string | null;
          enviado_em: string;
          request_id: number | null;
        }) => ({
          id: e.id,
          codigo: e.codigo,
          enviadoEm: e.enviado_em,
          status: e.request_id ? (respostas[String(e.request_id)]?.status ?? null) : null,
          erro: e.request_id ? (respostas[String(e.request_id)]?.erro ?? null) : null,
        }),
      ),
    };
  });

export const salvarLumenConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        url: z.string().url().max(500),
        token: z.string().max(500).optional(),
        pairCodes: z.array(z.string().trim().min(1).max(50)).max(100),
        enviarNome: z.boolean(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestor(context, data.clinicaId);
    const db = await admin();
    const token = data.token?.trim();
    const { data: atual } = await db
      .from("lumen_tv_config")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    const base = {
      url: data.url.trim() || URL_PADRAO,
      pair_codes: data.pairCodes.length ? data.pairCodes : null,
      enviar_nome: data.enviarNome,
      ativo: data.ativo,
    };
    if (atual) {
      const { error } = await db
        .from("lumen_tv_config")
        .update(token ? { ...base, token } : base)
        .eq("id", atual.id);
      if (error) throw new Error(error.message);
    } else {
      if (!token) throw new Error("Informe o token para salvar a primeira configuração.");
      const { error } = await db
        .from("lumen_tv_config")
        .insert({ ...base, token, clinica_id: data.clinicaId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const testarLumen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => clinicaInput.parse(d))
  .handler(async ({ data, context }) => {
    await exigirGestor(context, data.clinicaId);
    const db = await admin();
    const { data: cfg } = await db
      .from("lumen_tv_config")
      .select("url, token, pair_codes")
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!cfg) return { ok: false, status: 0, resposta: "Nenhuma configuração salva." };
    const corpo: Record<string, unknown> = { code: "TESTE", desk: "00" };
    if (cfg.pair_codes?.length) corpo.screenPairCodes = cfg.pair_codes;
    try {
      const r = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(8000),
      });
      const texto = (await r.text()).slice(0, 500);
      return { ok: r.ok, status: r.status, resposta: texto };
    } catch (e) {
      return { ok: false, status: 0, resposta: `Falha ao conectar: ${(e as Error).message}` };
    }
  });
