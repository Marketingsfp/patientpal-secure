import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FOCUS_API = "https://api.focusnfe.com.br/v2";

function authHeader(token: string) {
  // Focus NFe usa Basic Auth: base64(token + ":")
  const b64 = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${b64}`;
}

function only(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Emite uma NFS-e via Focus NFe.
 * Cria um registro local em `nfse` e dispara o envio assíncrono ao Focus.
 */
export const emitirNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      emitenteId: z.string().uuid(),
      pacienteId: z.string().uuid().optional(),
      pagamentoId: z.string().uuid().optional(),
      agendamentoId: z.string().uuid().optional(),
      valorServicos: z.number().positive(),
      descricaoServicos: z.string().min(1).max(2000),
      tomador: z.object({
        nome: z.string().min(2),
        cpfCnpj: z.string().optional(),
        email: z.string().email().optional(),
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        bairro: z.string().optional(),
        municipio: z.string().optional(),
        codigoMunicipio: z.string().optional(),
        uf: z.string().optional(),
      }),
      aliquotaIssOverride: z.number().min(0).max(1).optional(),
      itemListaOverride: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: emitente, error: errEmit } = await supabase
      .from("nfse_emitentes")
      .select("*")
      .eq("id", data.emitenteId)
      .single();
    if (errEmit || !emitente) throw new Error("Emitente não encontrado");

    const token =
      emitente.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const aliquota = data.aliquotaIssOverride ?? Number(emitente.aliquota_iss ?? 0.02);
    const valorIss = +(data.valorServicos * aliquota).toFixed(2);
    const ref = `nfse-${emitente.id.slice(0, 8)}-${Date.now()}`;

    const payload = {
      data_emissao: new Date().toISOString(),
      prestador: {
        cnpj: only(emitente.cnpj),
        inscricao_municipal: emitente.inscricao_municipal,
        codigo_municipio: emitente.codigo_municipio,
      },
      tomador: {
        cpf: data.tomador.cpfCnpj && only(data.tomador.cpfCnpj).length === 11 ? only(data.tomador.cpfCnpj) : undefined,
        cnpj: data.tomador.cpfCnpj && only(data.tomador.cpfCnpj).length === 14 ? only(data.tomador.cpfCnpj) : undefined,
        razao_social: data.tomador.nome,
        email: data.tomador.email,
        endereco: data.tomador.logradouro
          ? {
              logradouro: data.tomador.logradouro,
              numero: data.tomador.numero ?? "S/N",
              bairro: data.tomador.bairro ?? "Centro",
              codigo_municipio: data.tomador.codigoMunicipio ?? emitente.codigo_municipio,
              uf: data.tomador.uf ?? emitente.uf,
              cep: only(data.tomador.cep),
            }
          : undefined,
      },
      servico: {
        aliquota: aliquota * 100, // Focus espera percentual (ex: 2.00 = 2%)
        discriminacao: data.descricaoServicos,
        iss_retido: false,
        item_lista_servico: data.itemListaOverride ?? emitente.item_lista_servico,
        codigo_tributario_municipio: emitente.codigo_tributario_municipio ?? undefined,
        codigo_cnae: emitente.codigo_cnae ?? undefined,
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
      },
    };

    // Cria registro local antes do envio (para rastreio mesmo se Focus falhar)
    const { data: nota, error: errIns } = await supabase
      .from("nfse")
      .insert({
        clinica_id: emitente.clinica_id,
        emitente_id: emitente.id,
        paciente_id: data.pacienteId ?? null,
        pagamento_id: data.pagamentoId ?? null,
        agendamento_id: data.agendamentoId ?? null,
        data_emissao: new Date().toISOString().slice(0, 10),
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
        aliquota_iss: aliquota,
        descricao_servicos: data.descricaoServicos,
        tomador_nome: data.tomador.nome,
        tomador_documento: data.tomador.cpfCnpj ?? null,
        tomador_email: data.tomador.email ?? null,
        tomador_endereco: data.tomador.logradouro ? data.tomador : null,
        focus_ref: ref,
        focus_status: "enviando",
        status: "processando",
        payload_envio: payload,
        emitida_por: userId,
      })
      .select()
      .single();
    if (errIns) throw errIns;

    // Envia para o Focus
    const url = `${FOCUS_API}/nfse?ref=${encodeURIComponent(ref)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(token),
      },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      await supabase
        .from("nfse")
        .update({
          status: "erro",
          focus_status: body?.status ?? "erro",
          erro_mensagem: body?.mensagem ?? body?.erros?.[0]?.mensagem ?? `HTTP ${resp.status}`,
          payload_resposta: body,
        })
        .eq("id", nota.id);
      return { ok: false, id: nota.id, error: body?.mensagem ?? `HTTP ${resp.status}`, body };
    }

    await supabase
      .from("nfse")
      .update({
        focus_status: body?.status ?? "processando_autorizacao",
        payload_resposta: body,
      })
      .eq("id", nota.id);

    return { ok: true, id: nota.id, ref, focus: body };
  });

/** Consulta o status atual da nota no Focus NFe e atualiza o registro local. */
export const consultarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota, error } = await supabase
      .from("nfse")
      .select("id, focus_ref, emitente_id")
      .eq("id", data.id)
      .single();
    if (error || !nota?.focus_ref) throw new Error("Nota sem referência Focus");

    const { data: emitente } = await supabase
      .from("nfse_emitentes")
      .select("focus_ambiente")
      .eq("id", nota.emitente_id!)
      .single();
    const token =
      emitente?.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const resp = await fetch(`${FOCUS_API}/nfse/${nota.focus_ref}`, {
      headers: { Authorization: authHeader(token) },
    });
    const body = await resp.json().catch(() => ({}));

    const updates: Record<string, unknown> = {
      focus_status: body?.status ?? null,
      payload_resposta: body,
    };
    if (body?.status === "autorizado") {
      updates.status = "emitida";
      updates.numero = body?.numero ?? null;
      updates.serie = body?.serie ?? null;
      updates.codigo_verificacao = body?.codigo_verificacao ?? null;
      updates.url_pdf = body?.url_danfse ?? body?.caminho_danfse ? `https://api.focusnfe.com.br${body?.caminho_danfse}` : null;
      updates.url_xml = body?.caminho_xml_nota_fiscal ? `https://api.focusnfe.com.br${body?.caminho_xml_nota_fiscal}` : null;
    } else if (body?.status === "cancelado") {
      updates.status = "cancelada";
    } else if (body?.status === "erro_autorizacao" || body?.status === "erro") {
      updates.status = "erro";
      updates.erro_mensagem = body?.mensagem_sefaz ?? body?.mensagem ?? null;
    }

    await supabase.from("nfse").update(updates).eq("id", nota.id);
    return { ok: true, status: body?.status ?? null, body };
  });

/** Cancela uma NFS-e já emitida. */
export const cancelarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), justificativa: z.string().min(15).max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota } = await supabase
      .from("nfse")
      .select("focus_ref, emitente_id")
      .eq("id", data.id)
      .single();
    if (!nota?.focus_ref) throw new Error("Nota sem referência Focus");
    const { data: emitente } = await supabase
      .from("nfse_emitentes")
      .select("focus_ambiente")
      .eq("id", nota.emitente_id!)
      .single();
    const token =
      emitente?.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const resp = await fetch(`${FOCUS_API}/nfse/${nota.focus_ref}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: authHeader(token) },
      body: JSON.stringify({ justificativa: data.justificativa }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: body?.mensagem ?? `HTTP ${resp.status}` };

    await supabase
      .from("nfse")
      .update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        cancelada_motivo: data.justificativa,
        payload_resposta: body,
      })
      .eq("id", data.id);
    return { ok: true };
  });