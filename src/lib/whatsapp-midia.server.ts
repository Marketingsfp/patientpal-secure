import { fetchComAuditoriaIA } from "./nina/auditoria-ia.server";
import type { RegistrarChamadaIA } from "./nina/auditoria-ia";
import { VOCABULARIO_DICA, corrigirFala } from "@/lib/voz-correcoes";
import { MAPA_TEMPLATES } from "@/lib/nina/resposta/templates";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSupabaseUrl } from "@/integrations/supabase/env";
import {
  BUCKET_MIDIA_WHATSAPP,
  caminhoDaMidia,
  dataDeCorteMidia,
  limiteDeBytes,
  tipoMimeAceito,
  type TipoMidiaGuardada,
} from "@/lib/whatsapp-midia-armazenamento";

/** Imagem e áudio são lidos inteiros (a IA precisa do conteúdo); documento e vídeo seguem em fluxo. */
type TipoMidiaEmMemoria = Extract<TipoMidiaGuardada, "image" | "audio">;
import {
  PROMPT_LEITURA_IMAGEM,
  interpretarLeituraImagem,
  type LeituraImagem,
} from "@/lib/nina/leitura-imagem";

const META_VERSION_MEDIA = "v26.0";

/** Metadados da mídia (URL temporária assinada pela Meta). */
export async function metaFetchMediaUrl(
  mediaId: string,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ url: string | null; mime: string | null }> {
  const res = await fetchFn(`https://graph.facebook.com/${META_VERSION_MEDIA}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Falha ao obter mídia (${res.status})`);
  }
  return { url: json?.url ?? null, mime: json?.mime_type ?? null };
}

function bytesParaBase64(buf: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Baixa o binário da mídia (a URL da Meta exige o mesmo Bearer token). */
export async function metaDownloadMedia(
  url: string,
  accessToken: string,
): Promise<{ base64: string; mime: string | null }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status})`);
  const mime = res.headers.get("content-type");
  const buf = new Uint8Array(await res.arrayBuffer());
  return { base64: bytesParaBase64(buf), mime };
}

/** Pontos de saída (rede e bucket) trocáveis nos testes. */
export type DependenciasMidia = {
  fetchFn?: typeof fetch;
  armazenar?: (
    caminho: string,
    bytes: Uint8Array,
    mime: string,
  ) => Promise<{ message: string } | null>;
};

async function armazenarNoBucket(caminho: string, bytes: Uint8Array, mime: string) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_MIDIA_WHATSAPP)
    .upload(caminho, bytes, { contentType: mime, upsert: true });
  return error ? { message: error.message } : null;
}

export type MidiaRecebida = {
  /** Conteúdo baixado (quando deu certo), para a transcrição ou a leitura da imagem. */
  base64: string | null;
  mime: string | null;
  /** Caminho no bucket privado; null se não foi possível guardar (a conversa segue normalmente). */
  caminho: string | null;
  erro: string | null;
};

/**
 * Baixa a mídia da Meta UMA vez e guarda no bucket privado. Falha em guardar nunca derruba o
 * atendimento: o conteúdo ainda segue para a transcrição/leitura e a mensagem fica sem anexo.
 */
export async function receberMidiaWhatsapp(
  entrada: {
    clinicaId: string;
    waMessageId: string;
    tipo: TipoMidiaEmMemoria;
    mediaId: string;
    accessToken: string;
  },
  deps: DependenciasMidia = {},
): Promise<MidiaRecebida> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const { url, mime: mimeMeta } = await metaFetchMediaUrl(
      entrada.mediaId,
      entrada.accessToken,
      fetchFn,
    );
    if (!url)
      return {
        base64: null,
        mime: mimeMeta,
        caminho: null,
        erro: "URL da mídia não retornada pela Meta",
      };
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${entrada.accessToken}` } });
    if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status})`);
    const mimeBruto = res.headers.get("content-type") ?? mimeMeta;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0)
      return { base64: null, mime: mimeBruto, caminho: null, erro: "Mídia vazia" };
    if (bytes.length > limiteDeBytes(entrada.tipo)) {
      return {
        base64: null,
        mime: mimeBruto,
        caminho: null,
        erro: "Mídia acima do limite de tamanho",
      };
    }
    const base64 = bytesParaBase64(bytes);
    const mime = tipoMimeAceito(entrada.tipo, mimeBruto) ?? tipoMimeAceito(entrada.tipo, mimeMeta);
    if (!mime)
      return {
        base64,
        mime: mimeBruto,
        caminho: null,
        erro: `Tipo de mídia não guardado: ${mimeBruto ?? "?"}`,
      };
    const caminho = caminhoDaMidia({
      clinicaId: entrada.clinicaId,
      waMessageId: entrada.waMessageId,
      mime,
    });
    const falha = await (deps.armazenar ?? armazenarNoBucket)(caminho, bytes, mime);
    if (falha) {
      console.error("[whatsapp-midia] guardar mídia falhou", falha.message);
      return { base64, mime, caminho: null, erro: null };
    }
    return { base64, mime, caminho, erro: null };
  } catch (e) {
    return { base64: null, mime: null, caminho: null, erro: String((e as Error)?.message ?? e) };
  }
}

export type DependenciasArquivo = {
  fetchFn?: typeof fetch;
  /** Envio em fluxo (tamanho conhecido). */
  enviarEmFluxo?: (
    caminho: string,
    corpo: ReadableStream<Uint8Array>,
    mime: string,
    tamanho: number,
  ) => Promise<{ message: string } | null>;
  /** Envio com o conteúdo já em memória (tamanho desconhecido, dentro do teto). */
  armazenar?: (
    caminho: string,
    bytes: Uint8Array,
    mime: string,
  ) => Promise<{ message: string } | null>;
};

export type ArquivoRecebido = { mime: string | null; caminho: string | null; erro: string | null };

/** Envia o corpo da resposta da Meta direto ao bucket, sem carregar o arquivo na memória. */
async function enviarEmFluxoParaBucket(
  caminho: string,
  corpo: ReadableStream<Uint8Array>,
  mime: string,
  tamanho: number,
): Promise<{ message: string } | null> {
  const base = getSupabaseUrl();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !chave) return { message: "Armazenamento não configurado" };
  const destino = `${base.replace(/\/$/, "")}/storage/v1/object/${BUCKET_MIDIA_WHATSAPP}/${caminho
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(destino, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      apikey: chave,
      "Content-Type": mime,
      "Content-Length": String(tamanho),
      "x-upsert": "true",
    },
    body: corpo,
    // Obrigatório para corpo em fluxo fora do Worker (Node/undici).
    ...({ duplex: "half" } as Record<string, unknown>),
  });
  if (res.ok) return null;
  const detalhe = await res.text().catch(() => "");
  return { message: `Falha ao guardar arquivo (${res.status}) ${detalhe.slice(0, 200)}`.trim() };
}

/** Lê o corpo até o teto; passou do teto, cancela e devolve null. */
async function lerComTeto(
  corpo: ReadableStream<Uint8Array>,
  teto: number,
): Promise<Uint8Array | null> {
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > teto) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const todos = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    todos.set(p, pos);
    pos += p.length;
  }
  return todos;
}

/**
 * Documento ou vídeo recebido: baixa da Meta e guarda direto no bucket privado, em fluxo.
 * Falha nunca derruba o atendimento: a mensagem fica sem arquivo e o motivo vai no resultado.
 */
export async function receberArquivoWhatsapp(
  entrada: {
    clinicaId: string;
    waMessageId: string;
    tipo: "document" | "video";
    mediaId: string;
    accessToken: string;
    /** Tipo informado no próprio aviso do WhatsApp (usado se a Meta não devolver um tipo válido). */
    mimeInformado?: string | null;
  },
  deps: DependenciasArquivo = {},
): Promise<ArquivoRecebido> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const { url, mime: mimeMeta } = await metaFetchMediaUrl(
      entrada.mediaId,
      entrada.accessToken,
      fetchFn,
    );
    if (!url)
      return { mime: mimeMeta, caminho: null, erro: "URL do arquivo não retornada pela Meta" };
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${entrada.accessToken}` } });
    if (!res.ok || !res.body) throw new Error(`Falha ao baixar arquivo (${res.status})`);
    const mimeBruto = res.headers.get("content-type") ?? mimeMeta ?? entrada.mimeInformado ?? null;
    const mime =
      tipoMimeAceito(entrada.tipo, mimeBruto) ??
      tipoMimeAceito(entrada.tipo, mimeMeta) ??
      tipoMimeAceito(entrada.tipo, entrada.mimeInformado);
    if (!mime) {
      await res.body.cancel().catch(() => {});
      return {
        mime: mimeBruto,
        caminho: null,
        erro: `Tipo de arquivo não guardado: ${mimeBruto ?? "?"}`,
      };
    }
    const limite = limiteDeBytes(entrada.tipo);
    const tamanho = Number(res.headers.get("content-length"));
    const tamanhoConhecido = Number.isFinite(tamanho) && tamanho > 0;
    if (tamanhoConhecido && tamanho > limite) {
      await res.body.cancel().catch(() => {});
      return { mime, caminho: null, erro: "Arquivo acima do limite de tamanho" };
    }
    const caminho = caminhoDaMidia({
      clinicaId: entrada.clinicaId,
      waMessageId: entrada.waMessageId,
      mime,
    });
    let falha: { message: string } | null;
    if (tamanhoConhecido) {
      falha = await (deps.enviarEmFluxo ?? enviarEmFluxoParaBucket)(
        caminho,
        res.body,
        mime,
        tamanho,
      );
    } else {
      const bytes = await lerComTeto(res.body, limite);
      if (!bytes) return { mime, caminho: null, erro: "Arquivo acima do limite de tamanho" };
      falha = await (deps.armazenar ?? armazenarNoBucket)(caminho, bytes, mime);
    }
    if (falha) {
      console.error("[whatsapp-midia] guardar arquivo falhou", falha.message);
      return { mime, caminho: null, erro: falha.message };
    }
    return { mime, caminho, erro: null };
  } catch (e) {
    return { mime: null, caminho: null, erro: String((e as Error)?.message ?? e) };
  }
}

/**
 * Guarda uma cópia da mídia que a CLÍNICA enviou (ex.: áudio falado da Nina) e liga ao registro da
 * mensagem. Nunca derruba o envio: se algo falhar, a mensagem segue sem a cópia.
 */
export async function guardarMidiaEnviada(
  entrada: {
    clinicaId: string;
    mensagemId: string;
    waMessageId: string;
    tipo: TipoMidiaEmMemoria;
    bytes: Uint8Array;
    mime: string;
  },
  deps: {
    armazenar?: DependenciasMidia["armazenar"];
    ligar?: (mensagemId: string, caminho: string) => Promise<{ message: string } | null>;
  } = {},
): Promise<string | null> {
  try {
    const mime = tipoMimeAceito(entrada.tipo, entrada.mime);
    if (!mime || entrada.bytes.length === 0 || entrada.bytes.length > limiteDeBytes(entrada.tipo))
      return null;
    const caminho = caminhoDaMidia({
      clinicaId: entrada.clinicaId,
      waMessageId: entrada.waMessageId,
      mime,
    });
    const falha = await (deps.armazenar ?? armazenarNoBucket)(caminho, entrada.bytes, mime);
    if (falha) {
      console.error("[whatsapp-midia] cópia da mídia enviada falhou", falha.message);
      return null;
    }
    const erro = await (deps.ligar ?? ligarMidiaNaMensagem)(entrada.mensagemId, caminho);
    if (erro) {
      console.error("[whatsapp-midia] vínculo da mídia enviada falhou", erro.message);
      return null;
    }
    return caminho;
  } catch (e) {
    console.error("[whatsapp-midia] cópia da mídia enviada falhou", e);
    return null;
  }
}

async function ligarMidiaNaMensagem(mensagemId: string, caminho: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_mensagens")
    .update({ media_url: caminho })
    .eq("id", mensagemId);
  return error ? { message: error.message } : null;
}

/** Lê a imagem com IA só para identificar pedido médico. Qualquer falha vira "outro" (atendente). */
export async function lerPedidoNaImagem(
  base64: string,
  mime: string,
  registrar?: RegistrarChamadaIA,
): Promise<LeituraImagem> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { tipo: "falha_tecnica", motivo: "configuracao" };
  try {
    const res = await fetchComAuditoriaIA(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: PROMPT_LEITURA_IMAGEM },
            {
              role: "user",
              content: [
                { type: "text", text: "Leia esta imagem:" },
                { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            },
          ],
        }),
      },
      { finalidade: "leitura_imagem", modelo: "google/gemini-2.5-flash" },
      registrar,
    );
    if (!res.ok) {
      console.error("[whatsapp-midia] leitura de imagem falhou", res.status);
      return { tipo: "falha_tecnica", motivo: "provedor" };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return interpretarLeituraImagem(json.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("[whatsapp-midia] leitura de imagem exception", e);
    return { tipo: "falha_tecnica", motivo: "provedor" };
  }
}

/**
 * Apaga as mídias que passaram dos 5 anos de guarda (arquivo e vínculo). Roda de forma
 * oportunista, pouco a pouco, quando chegam mensagens; o texto e a transcrição continuam.
 * Nada é apagado antes do prazo.
 */
export async function limparMidiasExpiradas(
  clinicaId: string,
  limite = 100,
  admin: typeof supabaseAdmin = supabaseAdmin,
): Promise<number> {
  const corte = dataDeCorteMidia().toISOString();
  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .select("id, media_url")
    .eq("clinica_id", clinicaId)
    .like("media_url", `${clinicaId}/%`)
    .lt("recebida_em", corte)
    .limit(limite);
  if (error || !data?.length) return 0;
  const { error: erroRemover } = await admin.storage
    .from(BUCKET_MIDIA_WHATSAPP)
    .remove(data.map((m) => String(m.media_url)));
  if (erroRemover) {
    console.error("[whatsapp-midia] limpeza falhou", erroRemover.message);
    return 0;
  }
  await admin
    .from("whatsapp_mensagens")
    .update({ media_url: null })
    .in(
      "id",
      data.map((m) => m.id),
    );
  return data.length;
}

function formatoDeMime(mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("amr")) return "amr";
  return "ogg"; // padrão do WhatsApp (opus/ogg)
}

/** Transcreve áudio em português usando o gateway de IA da Lovable. */
export async function transcreverAudioBase64(
  base64: string,
  mime: string | null,
  registrar?: RegistrarChamadaIA,
): Promise<{ texto: string; erro: string | null }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { texto: "", erro: "LOVABLE_API_KEY ausente" };

  const sys = `Transcreva o áudio em português do Brasil, com pontuação correta.
Retorne APENAS o texto transcrito, sem comentários, aspas ou prefixos.
VOCABULÁRIO ESPERADO (prefira estas grafias quando o som for parecido): ${VOCABULARIO_DICA}.
Se o áudio estiver inaudível ou vazio, responda exatamente: (inaudível)`;

  try {
    const res = await fetchComAuditoriaIA(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: [
                { type: "text", text: "Transcreva este áudio:" },
                {
                  type: "input_audio",
                  input_audio: { data: base64, format: formatoDeMime(mime) },
                },
              ],
            },
          ],
        }),
      },
      { finalidade: "transcricao_audio", modelo: "google/gemini-2.5-flash" },
      registrar,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("transcrever audio whatsapp erro", res.status, body);
      return { texto: "", erro: `Falha na transcrição (${res.status})` };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const bruto = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!bruto || /^\(?inaud[ií]vel\)?$/i.test(bruto)) return { texto: "", erro: null };
    return { texto: corrigirFala(bruto), erro: null };
  } catch (e) {
    console.error("transcrever audio whatsapp exception", e);
    return { texto: "", erro: String((e as Error)?.message ?? e) };
  }
}

/** Baixa e transcreve um áudio recebido no WhatsApp. */
export async function transcreverAudioWhatsapp(
  mediaId: string,
  accessToken: string,
): Promise<{ texto: string; erro: string | null; mime: string | null }> {
  try {
    const { url, mime } = await metaFetchMediaUrl(mediaId, accessToken);
    if (!url) return { texto: "", erro: "URL da mídia não retornada pela Meta", mime };
    const bin = await metaDownloadMedia(url, accessToken);
    const r = await transcreverAudioBase64(bin.base64, bin.mime ?? mime);
    return { ...r, mime: bin.mime ?? mime };
  } catch (e) {
    return { texto: "", erro: String((e as Error)?.message ?? e), mime: null };
  }
}

/**
 * FASE 5 — os textos de mídia agora moram nos templates versionados. Estes
 * exports continuam existindo para compatibilidade e devolvem o texto PADRÃO
 * (sem publicação). O caminho de envio usa a finalização, que aplica o
 * template publicado quando existir.
 */
export const CHAVES_TEMPLATE_MIDIA: Record<string, string> = {
  image: "midia.imagem",
  image_receita: "midia.receita_remedio",
  document: "midia.documento",
  sticker: "midia.figurinha",
};

export function chaveTemplateMidia(tipo: string): string {
  return CHAVES_TEMPLATE_MIDIA[tipo] ?? "midia.outro";
}

export const CHAVE_TEMPLATE_AUDIO_FALHOU = "midia.audio_falhou";

export const RESPOSTA_AUDIO_FALHOU = MAPA_TEMPLATES["midia.audio_falhou"]!.padrao;

export function respostaMidiaNaoSuportada(tipo: string): string {
  return MAPA_TEMPLATES[chaveTemplateMidia(tipo)]!.padrao;
}

const ULTIMA_LIMPEZA = new Map<string, number>();
const INTERVALO_LIMPEZA_MS = 60 * 60 * 1000;

/** Mesma limpeza, no máximo a cada hora por clínica neste servidor; nunca derruba o webhook. */
export async function limparMidiasExpiradasSeChegouAHora(clinicaId: string): Promise<void> {
  const agora = Date.now();
  if (agora - (ULTIMA_LIMPEZA.get(clinicaId) ?? 0) < INTERVALO_LIMPEZA_MS) return;
  ULTIMA_LIMPEZA.set(clinicaId, agora);
  try {
    await limparMidiasExpiradas(clinicaId);
  } catch (e) {
    console.error("[whatsapp-midia] limpeza de mídias expiradas falhou", e);
  }
}
