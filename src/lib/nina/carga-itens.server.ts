/** Resultados duráveis por item. Nunca repete uma entrada já aceita pela Nina. */
import { chaveMensagemCarga, type CargaPersistida } from "./carga-controle";

export const EXECUTOR_CARGA_POR_ITEM = "carga-v3-item";
export const CONCORRENCIA_CARGA_EFETIVA = 1;
export type ItemCarga = {
  indice: number;
  leadId: string;
  leadIndice: number;
  cenario: string;
  mensagem: string;
};

export async function lerAmostrasCarga(admin: any, carga: CargaPersistida): Promise<any[]> {
  const { data, error } = await admin
    .from("nina_teste_carga_amostras")
    .select("*")
    .eq("clinica_id", carga.clinica_id)
    .eq("carga_id", carga.id)
    .order("indice");
  if (error) throw new Error("CARGA_RESULTADOS_INDISPONIVEIS");
  return [...new Map((data ?? []).map((a: any) => [a.indice, a])).values()];
}

export function totaisAmostrasCarga(amostras: any[]) {
  const soma = (campo: string) => amostras.reduce((n, a) => n + Number(a[campo] ?? 0), 0);
  return {
    enviadas: amostras.length,
    sucesso: amostras.filter((a) => a.status === "ok").length,
    erros: amostras.filter((a) => a.status === "erro").length,
    timeouts: amostras.filter((a) => a.status === "timeout").length,
    chamadas_modelo: soma("chamadas_modelo"),
    input_tokens: soma("input_tokens"),
    output_tokens: soma("output_tokens"),
    ferramentas: amostras.reduce((n, a) => n + (a.ferramentas?.length ?? 0), 0),
  };
}

/** Mesmo ID inclusive após queda entre INSERT da amostra e atualização dos contadores. */
export async function idAmostraCarga(cargaId: string, indice: number) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`nina:carga:resultado:${cargaId}:${indice}`),
    ),
  );
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function gravarAmostraCarga(
  admin: any,
  carga: CargaPersistida,
  item: ItemCarga,
  resultado: Record<string, unknown>,
) {
  const { error } = await admin.from("nina_teste_carga_amostras").upsert(
    {
      id: await idAmostraCarga(carga.id, item.indice),
      clinica_id: carga.clinica_id,
      carga_id: carga.id,
      indice: item.indice,
      lead_id: item.leadId,
      lead_indice: item.leadIndice,
      cenario: item.cenario,
      mensagem: item.mensagem.slice(0, 300),
      tentativa: 1,
      chamadas_modelo: 0,
      input_tokens: 0,
      output_tokens: 0,
      ferramentas: [],
      latencia_ms: null,
      ...resultado,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error("CARGA_RESULTADO_NAO_SALVO");
}

export type DesfechoItemCarga =
  | { tipo: "novo" }
  | { tipo: "pendente" }
  | { tipo: "terminal"; resultado: Record<string, unknown> };

/** Usa a identidade física e a execução vinculada; nunca a última mensagem da conversa. */
export async function desfechoItemCarga(
  admin: any,
  carga: CargaPersistida,
  item: ItemCarga,
): Promise<DesfechoItemCarga> {
  const chave = `test-${item.leadId}-${chaveMensagemCarga(carga.id, item.indice)}`;
  let r = await admin
    .from("whatsapp_mensagens")
    .select("id,conversa_id,execucao_id,nina_status,nina_error")
    .eq("clinica_id", carga.clinica_id)
    .eq("direction", "in")
    .eq("is_teste", true)
    .eq("wa_message_id", chave)
    .maybeSingle();
  if (["42703", "PGRST204"].includes(r.error?.code)) {
    r = await admin
      .from("whatsapp_mensagens")
      .select("id,conversa_id,execucao_id")
      .eq("clinica_id", carga.clinica_id)
      .eq("direction", "in")
      .eq("is_teste", true)
      .eq("wa_message_id", chave)
      .maybeSingle();
  }
  if (r.error) throw new Error("CARGA_ENTRADA_INDISPONIVEL");
  if (!r.data) return { tipo: "novo" };
  const m = r.data;
  if (m.nina_status === "completed")
    return {
      tipo: "terminal",
      resultado: {
        status: "ok",
        conversa_id: m.conversa_id,
        erro: null,
      },
    };
  const direta = await admin
    .from("whatsapp_mensagens")
    .select("id")
    .eq("clinica_id", carga.clinica_id)
    .eq("conversa_id", m.conversa_id)
    .eq("direction", "out")
    .eq("is_teste", true)
    .eq("tipo", "text")
    .in("status", ["sent", "delivered", "read"])
    .eq("wa_message_id", `${chave}-reply`)
    .maybeSingle();
  if (direta.error) throw new Error("CARGA_ENTREGA_INDISPONIVEL");
  if (direta.data)
    return {
      tipo: "terminal",
      resultado: {
        status: "ok",
        conversa_id: m.conversa_id,
        erro: null,
      },
    };
  if (m.execucao_id) {
    const { data: saida, error } = await admin
      .from("whatsapp_mensagens")
      .select("id")
      .eq("clinica_id", carga.clinica_id)
      .eq("conversa_id", m.conversa_id)
      .eq("direction", "out")
      .eq("is_teste", true)
      .eq("enviada_por", "nina")
      .eq("tipo", "text")
      .in("status", ["sent", "delivered", "read"])
      .eq("execucao_id", m.execucao_id)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("CARGA_ENTREGA_INDISPONIVEL");
    if (saida)
      return {
        tipo: "terminal",
        resultado: {
          status: "ok",
          conversa_id: m.conversa_id,
          erro: null,
        },
      };
  }
  if (m.nina_status === "failed" || m.nina_status === "handoff")
    return {
      tipo: "terminal",
      resultado: {
        status: m.nina_status === "failed" ? "erro" : "cancelado",
        conversa_id: m.conversa_id,
        erro: m.nina_error ?? "ENCAMINHAMENTO_SEM_RESPOSTA",
      },
    };
  if (m.nina_status) return { tipo: "pendente" };
  return {
    tipo: "terminal",
    resultado: {
      status: "erro",
      conversa_id: m.conversa_id,
      erro: "ENTRADA_ACEITA_SEM_DESFECHO: não reenviada; recuperação requer watchdog ativo.",
    },
  };
}
