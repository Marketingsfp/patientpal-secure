import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "backups-diarios";

/** Lista os dias com backup salvo para a clínica do usuário. */
export const listarBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clinica_id: string }) => d)
  .handler(async ({ data, context }) => {
    // Garante que o usuário é admin da clínica
    const { data: mem } = await context.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("user_id", context.userId)
      .eq("clinica_id", data.clinica_id)
      .maybeSingle();
    if ((mem as { role?: string } | null)?.role !== "admin") {
      throw new Error("Somente administradores podem acessar backups");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: dias, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(data.clinica_id, { limit: 1000, sortBy: { column: "name", order: "desc" } });
    if (error) throw new Error(error.message);

    const out: Array<{ data: string; arquivos: number; bytes: number }> = [];
    for (const d of (dias ?? []) as Array<{ name: string }>) {
      if (!d.name) continue;
      const { data: files } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(`${data.clinica_id}/${d.name}`, { limit: 1000 });
      const arr = (files ?? []) as Array<{ name: string; metadata?: { size?: number } }>;
      const bytes = arr.reduce((s, f) => s + (f.metadata?.size ?? 0), 0);
      out.push({ data: d.name, arquivos: arr.length, bytes });
    }
    return out;
  });

/** Retorna URLs assinadas para baixar todos os arquivos de um dia (10 min). */
export const baixarBackupDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clinica_id: string; data: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: mem } = await context.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("user_id", context.userId)
      .eq("clinica_id", data.clinica_id)
      .maybeSingle();
    if ((mem as { role?: string } | null)?.role !== "admin") {
      throw new Error("Somente administradores podem baixar backups");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const prefix = `${data.clinica_id}/${data.data}`;
    const { data: files, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000 });
    if (error) throw new Error(error.message);

    const arr = (files ?? []) as Array<{ name: string }>;
    const paths = arr.map((f) => `${prefix}/${f.name}`);
    if (!paths.length) return { urls: [] as Array<{ nome: string; url: string }> };

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 10);
    if (sErr) throw new Error(sErr.message);

    return {
      urls: (signed ?? []).map((s) => ({
        nome: s.path?.split("/").pop() ?? "arquivo.csv",
        url: s.signedUrl,
      })),
    };
  });

/** Dispara o backup agora (chamada manual para admins). */
export const dispararBackupAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: mems } = await context.supabase
      .from("clinica_memberships")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .limit(1);
    if (!mems || mems.length === 0) {
      throw new Error("Somente administradores podem disparar backup");
    }
    const projectId = process.env.SUPABASE_PROJECT_ID!;
    const url = `https://project--${projectId}.lovable.app/api/public/hooks/backup-diario`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
      },
      body: "{}",
    });
    const body = await res.text();
    return { status: res.status, body };
  });