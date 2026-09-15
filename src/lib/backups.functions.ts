import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "backups-diarios";

/**
 * Descobre o "project ref" do Supabase — o `<ref>` de `https://<ref>.supabase.co`
 * — usado para montar a URL do webhook de backup.
 *
 * O Lovable Cloud não deixa criar secrets com o prefixo `SUPABASE_`, então
 * `SUPABASE_PROJECT_ID` pode não existir lá. Por isso o ref é derivado primeiro
 * da `SUPABASE_URL` (injetada pela própria plataforma), com
 * `SUPABASE_PROJECT_ID` mantido como fallback para ambientes que ainda a
 * definam. Se nenhum dos dois resolver, é melhor falhar com uma mensagem clara
 * do que disparar um POST para uma URL com "undefined" no meio.
 */
function resolverProjectRef(): string {
  const url = process.env.SUPABASE_URL?.trim();
  if (url) {
    const match = /^https?:\/\/([a-z0-9-]+)\.supabase\.[a-z.]+/i.exec(url);
    if (match) return match[1];
  }

  const projectId = process.env.SUPABASE_PROJECT_ID?.trim();
  if (projectId) return projectId;

  throw new Error(
    "Não foi possível descobrir o project ref do Supabase: defina SUPABASE_URL " +
      "(no formato https://<ref>.supabase.co) ou SUPABASE_PROJECT_ID no servidor.",
  );
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Isolamento por clínica: o backup é lido com a chave de serviço (que ignora
 * as regras do banco), então esta checagem é a única barreira entre um
 * usuário e os CSVs de outra clínica. O vínculo é buscado pelo id do token
 * verificado — nunca por algo que venha do navegador — e precisa ser de admin
 * ATIVO exatamente na clínica pedida.
 */
async function exigirAdminAtivoDaClinica(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { supabase: any; userId: string },
  clinicaId: string,
  acao: string,
) {
  const { data: mem, error } = await context.supabase
    .from("clinica_memberships")
    .select("role, ativo, clinica_id")
    .eq("user_id", context.userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  const m = mem as { role?: string; ativo?: boolean; clinica_id?: string } | null;
  if (error || !m || m.ativo !== true || m.clinica_id !== clinicaId || m.role !== "admin") {
    console.warn("[BACKUP] acesso negado", { userId: context.userId, clinicaId, acao });
    throw new Error("Somente administradores desta clínica podem acessar os backups dela");
  }
}

/** Lista os dias com backup salvo para a clínica do usuário. */
export const listarBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinica_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirAdminAtivoDaClinica(context, data.clinica_id, "listar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dias, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(data.clinica_id, { limit: 1000, sortBy: { column: "name", order: "desc" } });
    if (error) throw new Error(error.message);

    const out: Array<{ data: string; arquivos: number; bytes: number }> = [];
    for (const d of (dias ?? []) as Array<{ name: string }>) {
      if (!d.name || !DIA_RE.test(d.name)) continue;
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
  .inputValidator((input: unknown) =>
    z
      .object({
        clinica_id: z.string().uuid(),
        data: z.string().regex(DIA_RE),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigirAdminAtivoDaClinica(context, data.clinica_id, "baixar");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prefix = `${data.clinica_id}/${data.data}`;
    const { data: files, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000 });
    if (error) throw new Error(error.message);

    // Só nomes simples de arquivo: nada de "/" ou ".." que escape da pasta
    // da clínica autorizada.
    const arr = (files ?? []) as Array<{ name: string }>;
    const paths = arr
      .filter((f) => f.name && !f.name.includes("/") && !f.name.includes(".."))
      .map((f) => `${prefix}/${f.name}`);
    if (!paths.length) return { urls: [] as Array<{ nome: string; url: string }> };

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 5);
    if (sErr) throw new Error(sErr.message);

    console.info("[BACKUP] download autorizado", {
      userId: context.userId,
      clinicaId: data.clinica_id,
      dia: data.data,
      arquivos: paths.length,
    });

    return {
      urls: (signed ?? [])
        .filter((s) => s.path?.startsWith(`${prefix}/`))
        .map((s) => ({
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
      .eq("ativo", true)
      .limit(1);
    if (!mems || mems.length === 0) {
      throw new Error("Somente administradores podem disparar backup");
    }
    const projectRef = resolverProjectRef();
    const url = `https://project--${projectRef}.lovable.app/api/public/hooks/backup-diario`;
    const backupToken = process.env.BACKUP_WEBHOOK_TOKEN;
    if (!backupToken) {
      throw new Error("BACKUP_WEBHOOK_TOKEN não configurado no servidor");
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-backup-token": backupToken,
      },
      body: "{}",
    });
    const body = await res.text();
    return { status: res.status, body };
  });
