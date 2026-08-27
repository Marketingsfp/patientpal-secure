/**
 * Resposta em ÁUDIO da Nina no WhatsApp.
 *
 * Quando o paciente manda uma nota de voz, a Nina responde falando. O áudio é
 * sintetizado pela mesma configuração de voz já usada no projeto (gateway de
 * IA da Lovable, voz feminina "nova" — a mesma do fallback do TTS do painel),
 * enviado como mídia para a Cloud API da Meta e registrado no inbox.
 *
 * Regra de ouro: qualquer falha aqui NÃO pode deixar o paciente sem resposta —
 * quem chama cai para texto.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Flag por clínica que DESLIGA a resposta em áudio (padrão: ligada). */
export const FLAG_NINA_AUDIO_DESATIVADO = "nina_resposta_audio_desativada";

/** Acima disso, nota de voz vira ruim: manda áudio curto + texto completo. */
export const LIMITE_FALA_CURTA = 350;

/** Voz usada pela Nina (mesma do TTS do painel: feminina). */
const VOZ_NINA = "nova";
const MODELO_TTS = "openai/gpt-4o-mini-tts";

export async function respostaAudioDesativada(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_AUDIO_DESATIVADO)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.ativo);
}

/** Tira markdown/bullets e ajusta o texto para soar natural falado. */
export function prepararParaFala(texto: string): string {
  return (texto ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*•+]\s+/gm, " ")
    .replace(/^\s*\d+[.)]\s+/gm, " ")
    .replace(/[*_~#>|]/g, " ")
    .replace(/(\d{1,2}):00\b/g, "$1 horas")
    .replace(/(\d{1,2}):(\d{2})\b/g, "$1 e $2")
    .replace(/\s{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/** Detecta resposta em lista (vários itens/linhas) — ruim para nota de voz. */
export function pareceLista(texto: string): boolean {
  const linhas = (texto ?? "").split("\n").filter((l) => l.trim());
  const itens = linhas.filter((l) => /^\s*([-*•+]|\d+[.)])\s+/.test(l)).length;
  return itens >= 2 || linhas.length >= 4;
}

/**
 * Versão curta e falável de uma resposta longa: primeira frase + aviso de que
 * o detalhe vai por escrito.
 */
export function resumoFalado(texto: string): string {
  const limpo = prepararParaFala(texto).replace(/\n+/g, " ");
  const frases = limpo.match(/[^.!?]+[.!?]?/g) ?? [limpo];
  let resumo = "";
  for (const f of frases) {
    if ((resumo + f).length > 240) break;
    resumo += f;
  }
  if (!resumo.trim()) resumo = limpo.slice(0, 240);
  return `${resumo.trim()} Vou te mandar os detalhes por escrito logo abaixo.`;
}

/**
 * Sintetiza a fala. Tenta OGG/Opus (formato nativo de nota de voz do
 * WhatsApp) e, se o provedor não entregar, cai para MP3 — o WhatsApp também
 * aceita `audio/mpeg`.
 */
export async function sintetizarFala(
  texto: string,
): Promise<{ bytes: Uint8Array; mime: string; ext: string } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("nina audio: LOVABLE_API_KEY ausente");
    return null;
  }
  const tentativas: Array<{ format: string; mime: string; ext: string }> = [
    { format: "opus", mime: "audio/ogg", ext: "ogg" },
    { format: "mp3", mime: "audio/mpeg", ext: "mp3" },
  ];
  for (const t of tentativas) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODELO_TTS,
          input: texto.slice(0, 3000),
          voice: VOZ_NINA,
          response_format: t.format,
        }),
      });
      if (!res.ok) {
        console.error(
          "nina audio tts erro",
          t.format,
          res.status,
          await res.text().catch(() => ""),
        );
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) continue;
      return { bytes, mime: t.mime, ext: t.ext };
    } catch (e) {
      console.error("nina audio tts exception", t.format, e);
    }
  }
  return null;
}
