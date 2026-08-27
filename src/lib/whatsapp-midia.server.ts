import { VOCABULARIO_DICA, corrigirFala } from "@/lib/voz-correcoes";

const META_VERSION_MEDIA = "v26.0";

/** Metadados da mídia (URL temporária assinada pela Meta). */
export async function metaFetchMediaUrl(
  mediaId: string,
  accessToken: string,
): Promise<{ url: string | null; mime: string | null }> {
  const res = await fetch(`https://graph.facebook.com/${META_VERSION_MEDIA}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Falha ao obter mídia (${res.status})`);
  }
  return { url: json?.url ?? null, mime: json?.mime_type ?? null };
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
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return { base64: btoa(bin), mime };
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

export const RESPOSTA_AUDIO_FALHOU =
  "Não consegui ouvir seu áudio direito 😕 Pode me escrever por texto, por favor?";

export function respostaMidiaNaoSuportada(tipo: string): string {
  if (tipo === "image")
    return "Recebi sua imagem 📷 No momento não consigo analisar imagens por aqui — um atendente vai olhar e responder. Se puder, me descreva por texto o que precisa.";
  if (tipo === "document")
    return "Recebi seu documento 📄 Um atendente vai conferir e responder. Se puder, me diga por texto do que se trata.";
  if (tipo === "sticker") return "Recebi 😊 Como posso te ajudar?";
  return "Recebi sua mensagem. Um atendente vai olhar e responder em breve. Se preferir, me escreva por texto o que precisa.";
}
