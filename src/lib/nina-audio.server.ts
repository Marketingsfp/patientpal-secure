import { fetchComAuditoriaIA } from "./nina/auditoria-ia.server";
import type { RegistrarChamadaIA } from "./nina/auditoria-ia";
import { FLAG_VOZ_NINA, MODELO_VOZ_NINA, VOZ_PADRAO, instrucoesVoz, type VozConfig } from "./nina/voz-config";
import { lerVozNina } from "./nina/voz-config.server";
/**
 * Resposta em ÁUDIO da Nina no WhatsApp.
 *
 * Quando o paciente manda uma nota de voz, a Nina responde falando. O áudio é
 * sintetizado pelo gateway da Lovable com a configuração da aba Voz da Nina
 * (padrão: Nova). A mesma configuração vale para WhatsApp e homologação,
 * enviado como mídia para a Cloud API da Meta e registrado no inbox.
 *
 * Regra de ouro: qualquer falha aqui NÃO pode deixar o paciente sem resposta —
 * quem chama cai para texto.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deveResponderEmAudio } from "./nina/audio";

/** Flag por clínica que DESLIGA a resposta em áudio (padrão: ligada). */
export const FLAG_NINA_AUDIO_DESATIVADO = FLAG_VOZ_NINA;

/** Acima disso, nota de voz vira ruim: manda áudio curto + texto completo. */
export const LIMITE_FALA_CURTA = 350;

const MODELO_TTS = MODELO_VOZ_NINA;

export async function respostaAudioDesativada(clinicaId: string): Promise<boolean> {
  try { return !(await lerVozNina(clinicaId)).audioAtivo; }
  catch { return true; }
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
  registrar?: RegistrarChamadaIA,
  configuracao: VozConfig = VOZ_PADRAO,
  formatoPrevia?: "mp3",
): Promise<{ bytes: Uint8Array; mime: string; ext: string } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    console.error("nina audio: LOVABLE_API_KEY ausente");
    return null;
  }
  const tentativas: Array<{ format: string; mime: string; ext: string }> = formatoPrevia ? [
    { format: "mp3", mime: "audio/mpeg", ext: "mp3" },
  ] : [
    { format: "opus", mime: "audio/ogg", ext: "ogg" },
    { format: "mp3", mime: "audio/mpeg", ext: "mp3" },
  ];
  for (const t of tentativas) {
    try {
      const res = await fetchComAuditoriaIA("https://ai.gateway.lovable.dev/v1/audio/speech", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODELO_TTS,
          input: texto.slice(0, 3000),
          voice: configuracao.voz,
          speed: configuracao.velocidade,
          instructions: instrucoesVoz(configuracao),
          response_format: t.format,
        }),
      }, { finalidade: "sintese_voz", modelo: MODELO_TTS, caracteres: texto.slice(0, 3000).length, formato: t.format }, registrar);
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
      if (bytes.length === 0 || bytes.length > 16 * 1024 * 1024) continue;
      const tipo = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      const { tipoMimeAceito, extensaoDoMime } = await import("./whatsapp-midia-armazenamento");
      const mime = tipo === "application/octet-stream" ? t.mime : tipoMimeAceito("audio", tipo);
      if (!mime) continue;
      return { bytes, mime, ext: extensaoDoMime(mime) };
    } catch (e) {
      console.error("nina audio tts exception", t.format, e);
    }
  }
  return null;
}

/** Mesmo critério e mesma fala nos dois transportes; só o envio é diferente. */
export async function prepararAudioResposta(clinicaId: string, resposta: string,
  entrada: { recebeuAudio: boolean; mensagem: string }, registrar?: RegistrarChamadaIA) {
  if (!resposta.trim() || !deveResponderEmAudio(entrada)) return null;
  let selecao;
  try { selecao = await lerVozNina(clinicaId); }
  catch { console.warn("nina audio: falha ao ler configuração; mantendo resposta em texto"); return null; }
  if (!selecao.audioAtivo) return null;
  const configuracao = selecao.configuracao;
  const falaCompleta = prepararParaFala(resposta);
  // A leitura de horários pode expandir o texto; nunca truncar a fala silenciosamente.
  const longa = resposta.length > configuracao.limiteResumo || falaCompleta.length > 3000 || pareceLista(resposta);
  if (longa && configuracao.respostasLongas === "somente_texto") return null;
  const texto = longa ? resumoFalado(resposta) : falaCompleta;
  const audio = await sintetizarFala(texto, registrar, configuracao);
  return audio ? { ...audio, texto, longa } : null;
}

/** Homologação também guarda o arquivo para reprodução após recarregar a conversa. */
export async function guardarAudioMensagem(clinicaId: string, mensagemId: string,
  audio: { bytes: Uint8Array; mime: string }) {
  const { caminhoDaMidia, BUCKET_MIDIA_WHATSAPP } = await import("./whatsapp-midia-armazenamento");
  const caminho = caminhoDaMidia({ clinicaId, waMessageId: mensagemId, mime: audio.mime });
  const { error } = await supabaseAdmin.storage.from(BUCKET_MIDIA_WHATSAPP)
    .upload(caminho, audio.bytes, { contentType: audio.mime, upsert: true });
  if (error) throw new Error("Não foi possível guardar o áudio da mensagem");
  const { error: erroVinculo } = await supabaseAdmin.from("whatsapp_mensagens")
    .update({ media_url: caminho, media_mime: audio.mime }).eq("id", mensagemId).eq("clinica_id", clinicaId);
  if (erroVinculo) throw new Error("Não foi possível vincular o áudio à mensagem");
}

export type AuditoriaAudio = {
  textoFinalHash?: string | null;
  decisaoId?: string | null;
  avaliarRepresentacao?: (texto: string, representacao: "audio_integral" | "audio_resumo") =>
    Promise<{ decisaoId: string | null; textoHash: string | null } | null>;
};

/** A nota acompanha a fala efetiva, nunca é copiada de um texto diferente. */
export async function avaliarFala(audio: { texto: string; longa: boolean }, auditoria: AuditoriaAudio) {
  const { hashDoTexto } = await import("./nina/confidence/hash");
  const { falaPrecisaDeAvaliacaoPropria } = await import("./nina/confidence/identidade-saida");
  const representacao = audio.longa ? "audio_resumo" as const : "audio_integral" as const;
  const textoHash = hashDoTexto(audio.texto);
  const precisa = falaPrecisaDeAvaliacaoPropria({ textoAvaliadoHash: auditoria.textoFinalHash, conteudoFalado: audio.texto }).precisa;
  const decisaoId = precisa ? (await auditoria.avaliarRepresentacao?.(audio.texto, representacao))?.decisaoId ?? null
    : auditoria.decisaoId ?? null;
  return { decisaoId, textoHash, representacao };
}
