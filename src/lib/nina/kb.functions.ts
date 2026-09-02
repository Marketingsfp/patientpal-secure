/**
 * Base de Conhecimentos da Nina — server functions usadas pela tela
 * "Nina → Base de conhecimentos".
 *
 * Segurança: toda operação valida no BACKEND que o usuário é admin/gestor com
 * vínculo ativo na clínica. A interface esconder o botão não é garantia.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EXT_OK = ["xlsx", "xls", "csv"];
const TAM_MAX = 20 * 1024 * 1024;

async function exigirAdmin(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
  if (!["admin", "gestor"].includes(String(data.role)))
    throw new Error("Apenas administradores e gestores podem alterar a Base de Conhecimentos.");
}

async function exigirMembro(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

/* ------------------------------------------------------------------ */

export const listarBasesKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirMembro(context.supabase, context.userId, data.clinicaId);
    const { data: bases, error } = await context.supabase
      .from("nina_kb_bases")
      .select(
        "id, titulo, arquivo_nome, arquivo_tipo, arquivo_tamanho, versao, status, registros_total, linhas_lidas, erros, validacao, enviado_por_nome, processado_em, ativada_em, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("versao", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { bases: bases ?? [] };
  });

export const enviarBaseKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        nomeArquivo: z.string().min(3).max(255),
        titulo: z.string().min(2).max(160).optional(),
        conteudoBase64: z.string().min(16),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);

    const ext = data.nomeArquivo.split(".").pop()?.toLowerCase() ?? "";
    if (!EXT_OK.includes(ext))
      throw new Error("Formato não suportado. Envie um arquivo .xlsx, .xls ou .csv.");

    const bytes = Uint8Array.from(atob(data.conteudoBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > TAM_MAX) throw new Error("Arquivo maior que 20 MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processarBase, BUCKET_KB } = await import("@/lib/nina/kb.server");

    const { data: ultima } = await supabaseAdmin
      .from("nina_kb_bases")
      .select("versao")
      .eq("clinica_id", data.clinicaId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();
    const versao = Number(ultima?.versao ?? 0) + 1;

    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", context.userId)
      .maybeSingle();

    const path = `${data.clinicaId}/v${versao}-${Date.now()}.${ext}`;
    const { error: erroUpload } = await supabaseAdmin.storage
      .from(BUCKET_KB)
      .upload(path, bytes, { contentType: "application/octet-stream", upsert: false });
    if (erroUpload) throw new Error(`Falha ao enviar o arquivo: ${erroUpload.message}`);

    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice(0, 5_000_000))),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: base, error } = await supabaseAdmin
      .from("nina_kb_bases")
      .insert({
        clinica_id: data.clinicaId,
        titulo: data.titulo ?? "TAP - TABELA DE ATENDIMENTOS E PREÇOS",
        arquivo_nome: data.nomeArquivo,
        arquivo_tipo: ext,
        arquivo_tamanho: bytes.byteLength,
        storage_path: path,
        arquivo_hash: hash,
        versao,
        status: "ENVIANDO",
        enviado_por: context.userId,
        enviado_por_nome: perfil?.nome ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const resultado = await processarBase(base.id);
    return { baseId: base.id, versao, ...resultado };
  });

export const reprocessarBaseKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), baseId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processarBase } = await import("@/lib/nina/kb.server");
    const { data: base } = await supabaseAdmin
      .from("nina_kb_bases")
      .select("id")
      .eq("id", data.baseId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!base) throw new Error("Base não encontrada nesta clínica.");
    return await processarBase(base.id);
  });

export const excluirBaseKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), baseId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidarCache, BUCKET_KB } = await import("@/lib/nina/kb.server");

    const { data: base } = await supabaseAdmin
      .from("nina_kb_bases")
      .select("id, storage_path")
      .eq("id", data.baseId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!base) throw new Error("Base não encontrada nesta clínica.");

    // Registros e embeddings saem junto (ON DELETE CASCADE).
    await supabaseAdmin.from("nina_kb_registros").delete().eq("base_id", base.id);
    await supabaseAdmin.from("nina_kb_bases").delete().eq("id", base.id);
    if (base.storage_path)
      await supabaseAdmin.storage.from(BUCKET_KB).remove([base.storage_path as string]);
    invalidarCache(data.clinicaId);
    return { ok: true };
  });

/** Homologação: pergunta livre + fonte usada (só para administradores). */
export const testarBaseKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), pergunta: z.string().min(2).max(500) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context.supabase, context.userId, data.clinicaId);
    const { consultarBase, registrarConsultaKb } = await import("@/lib/nina/kb.server");
    const { expandirTermos } = await import("@/lib/nina/kb-parser");

    const achado = await consultarBase({ clinicaId: data.clinicaId, termo: data.pergunta });
    const naoEncontrei =
      "Não encontrei essa informação na minha base no momento. Vou encaminhar sua dúvida para nossa equipe.";

    let resposta = naoEncontrei;
    const key = process.env["LOVABLE_API_KEY"];
    if (achado.encontrado && key) {
      const consolidado = (achado.consolidado ?? [])
        .map(
          (c: any) =>
            `PROFISSIONAL: ${c.medico}\nDias de atendimento (todos): ${c.dias
              .map((d: any) => [d.dia, d.horario, d.regra && `(${d.regra})`].filter(Boolean).join(" "))
              .join(", ") || "-"}\nValores originais da planilha: ${c.dias_original.join(" ; ") || "-"}`,
        )
        .join("\n");
      const fatos = achado.registros
        .slice(0, 20)
        .map(
          (r, i) =>
            `${i + 1}. Especialidade: ${r.categoria ?? "-"} | Procedimento: ${r.procedimento ?? "-"} | Médico: ${r.medico ?? "-"} | Dias: ${r.dia ?? "-"} (planilha: ${(r as any).extras?.dia_original ?? "-"}) | Horário: ${r.horario ?? "-"} | Dinheiro/PIX: ${r.preco_dinheiro ?? "-"} | Cartão: ${r.preco_cartao ?? "-"} | Preparo: ${r.preparo ?? "-"} | Observação: ${r.observacoes ?? "-"}`,
        )
        .join("\n");
      const contexto = consolidado
        ? `RESUMO CONSOLIDADO (já agregado pelo sistema — use TODOS os dias listados):\n${consolidado}\n\nREGISTROS:\n${fatos}`
        : fatos;
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content: `Você é a Nina, atendente da clínica. Responda em português do Brasil, de forma curta e natural, usando SOMENTE os fatos abaixo. Nunca invente preço, médico, dia, horário ou preparo. Se os fatos não responderem à pergunta, responda exatamente: "${naoEncontrei}". Se houver duas opções parecidas, peça ao paciente para esclarecer qual exame está no pedido médico. Horário aqui é escala do profissional, não vaga disponível.\n\nQuando a pergunta for sobre dias/escala de um profissional, liste TODOS os dias do resumo consolidado, sem omitir nenhum.\n\nFATOS DA BASE:\n${contexto}`,
            },
            { role: "user", content: data.pergunta },
          ],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        resposta = String(json?.choices?.[0]?.message?.content ?? naoEncontrei).trim();
      } else {
        resposta = `Falha ao consultar o modelo (${res.status}).`;
      }
    }

    void registrarConsultaKb({
      clinicaId: data.clinicaId,
      baseId: achado.base?.id ?? null,
      versao: achado.base?.versao ?? null,
      canal: "homologacao",
      pergunta: data.pergunta,
      termos: expandirTermos(data.pergunta),
      encontrados: achado.registros,
      resposta,
    });

    return { resposta, ...achado };
  });
