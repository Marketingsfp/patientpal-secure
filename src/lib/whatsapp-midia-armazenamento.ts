/**
 * Armazenamento das imagens e dos áudios recebidos no WhatsApp (regras puras, sem rede).
 *
 * A URL que a Meta entrega vale poucos minutos, por isso o arquivo é baixado na chegada e guardado
 * num bucket PRIVADO. `whatsapp_mensagens.media_url` guarda o CAMINHO no bucket (nunca um link
 * público); quem abre a conversa recebe um link assinado de vida curta.
 */

export const BUCKET_MIDIA_WHATSAPP = "whatsapp-midia";
/** Retenção combinada com a clínica: dados de saúde não ficam guardados para sempre. */
export const RETENCAO_MIDIA_DIAS = 30;
export const RETENCAO_MIDIA_MS = RETENCAO_MIDIA_DIAS * 24 * 60 * 60 * 1000;
/** Validade do link de visualização entregue à atendente. */
export const VALIDADE_LINK_MIDIA_S = 600;

/** Limites da própria Meta (imagem 5 MB, áudio 16 MB). */
export const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024;
export const LIMITE_BYTES_AUDIO = 16 * 1024 * 1024;

export type TipoMidiaGuardada = "image" | "audio";

export function ehMidiaGuardavel(tipo: string): tipo is TipoMidiaGuardada {
  return tipo === "image" || tipo === "audio";
}

export function limiteDeBytes(tipo: TipoMidiaGuardada): number {
  return tipo === "image" ? LIMITE_BYTES_IMAGEM : LIMITE_BYTES_AUDIO;
}

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
};

/** Tipos aceitos para guardar; qualquer outro (ex.: SVG, HTML) é recusado. */
export function tipoMimeAceito(tipo: TipoMidiaGuardada, mime: string | null | undefined): string | null {
  const limpo = String(mime ?? "").split(";")[0]!.trim().toLowerCase();
  if (!limpo || !(limpo in EXTENSOES)) return null;
  return limpo.startsWith(tipo === "image" ? "image/" : "audio/") ? limpo : null;
}

export function extensaoDoMime(mime: string): string {
  return EXTENSOES[mime] ?? "bin";
}

/** Caminho no bucket: `{clinica}/{ano-mês}/{id da mensagem no WhatsApp}.{ext}` (só caracteres seguros). */
export function caminhoDaMidia(entrada: {
  clinicaId: string;
  waMessageId: string;
  mime: string;
  agora?: Date;
}): string {
  const d = entrada.agora ?? new Date();
  const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const id = entrada.waMessageId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120) || "midia";
  return `${entrada.clinicaId}/${mes}/${id}.${extensaoDoMime(entrada.mime)}`;
}

/** O valor de `media_url` é um caminho guardado por nós (e não um link externo antigo)? */
export function ehCaminhoGuardado(valor: string | null | undefined): boolean {
  const v = String(valor ?? "");
  return v.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith("/");
}

/** O caminho pertence a esta clínica? Impede pedir o arquivo de outra clínica. */
export function caminhoEhDaClinica(caminho: string, clinicaId: string): boolean {
  return caminho.startsWith(`${clinicaId}/`) && !caminho.includes("..");
}

export function midiaExpirada(recebidaEm: string | Date, agora: Date = new Date()): boolean {
  const t = new Date(recebidaEm).getTime();
  return Number.isFinite(t) && agora.getTime() - t >= RETENCAO_MIDIA_MS;
}
