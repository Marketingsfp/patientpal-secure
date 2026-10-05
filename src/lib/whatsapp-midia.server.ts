import { VOCABULARIO_DICA, corrigirFala } from "@/lib/voz-correcoes";
import { MAPA_TEMPLATES } from "@/lib/nina/resposta/templates";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BUCKET_MIDIA_WHATSAPP,
  RETENCAO_MIDIA_MS,
  caminhoDaMidia,
  limiteDeBytes,
  tipoMimeAceito,
  type TipoMidiaGuardada,
} from "@/lib/whatsapp-midia-armazenamento";
import { PROMPT_LEITURA_IMAGEM, interpretarLeituraImagem, type LeituraImagem } from "@/lib/nina/leitura-imagem";

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
  armazenar?: (caminho: string, bytes: Uint8Array, mime: string) => Promise<{ message: string } | null>;
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
export async function receberMidiaWhatsapp(entrada: {
  clinicaId: string;
  waMessageId: string;
  tipo: TipoMidiaGuardada;
  mediaId: string;
  accessToken: string;
}, deps: DependenciasMidia = {}): Promise<MidiaRecebida> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const { url, mime: mimeMeta } = await metaFetchMediaUrl(entrada.mediaId, entrada.accessToken, fetchFn);
    if (!url) return { base64: null, mime: mimeMeta, caminho: null, erro: "URL da mídia não retornada pela Meta" };
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${entrada.accessToken}` } });
    if (!res.ok) throw new Error(`Falha ao baixar mídia (${res.status})`);
    const mimeBruto = res.headers.get("content-type") ?? mimeMeta;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return { base64: null, mime: mimeBruto, caminho: null, erro: "Mídia vazia" };
    if (bytes.length > limiteDeBytes(entrada.tipo)) {
      return { base64: null, mime: mimeBruto, caminho: null, erro: "Mídia acima do limite de tamanho" };
    }
    const base64 = bytesParaBase64(bytes);
    const mime = tipoMimeAceito(entrada.tipo, mimeBruto) ?? tipoMimeAceito(entrada.tipo, mimeMeta);
    if (!mime) return { base64, mime: mimeBruto, caminho: null, erro: `Tipo de mídia não guardado: ${mimeBruto ?? "?"}` };
    const caminho = caminhoDaMidia({ clinicaId: entrada.clinicaId, waMessageId: entrada.waMessageId, mime });
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

/** Lê a imagem com IA só para identificar pedido médico. Qualquer falha vira "ilegivel" (controle de nova foto). */
export async function lerPedidoNaImagem(base64: string, mime: string): Promise<LeituraImagem> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { tipo: "ilegivel" };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });
    if (!res.ok) {
      console.error("[whatsapp-midia] leitura de imagem falhou", res.status);
      return { tipo: "ilegivel" };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return interpretarLeituraImagem(json.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("[whatsapp-midia] leitura de imagem exception", e);
    return { tipo: "ilegivel" };
  }
}

/**
 * Apaga as mídias com mais de 30 dias (arquivo e vínculo). Roda de forma oportunista, pouco a
 * pouco, quando chegam mensagens; o texto e a transcrição da conversa continuam.
 */
export async function limparMidiasExpiradas(
  clinicaId: string,
  limite = 100,
  admin: typeof supabaseAdmin = supabaseAdmin,
): Promise<number> {
  const corte = new Date(Date.now() - RETENCAO_MIDIA_MS).toISOString();
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
    .in("id", data.map((m) => m.id));
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
): Promise<{ texto: string; erro: string | null }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { texto: "", erro: "LOVABLE_API_KEY ausente" };

  const sys = `Transcreva o áudio em português do Brasil, com pontuação correta.
Retorne APENAS o texto transcrito, sem comentários, aspas ou prefixos.
VOCABULÁRIO ESPERADO (prefira estas grafias quando o som for parecido): ${VOCABULARIO_DICA}.
Se o áudio estiver inaudível ou vazio, responda exatamente: (inaudível)`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });
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
const INTERVALO_LIMPEZA_MS = 10 * 60 * 1000;

/** Mesma limpeza, no máximo a cada 10 minutos por clínica neste servidor; nunca derruba o webhook. */
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
