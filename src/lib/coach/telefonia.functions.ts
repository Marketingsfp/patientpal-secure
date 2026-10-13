/**
 * Diagnóstico da telefonia Sufficit no Coach. Só gestão (escrita) do Coach.
 * Nada aqui grava a amostra: ela volta para a tela e só.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
