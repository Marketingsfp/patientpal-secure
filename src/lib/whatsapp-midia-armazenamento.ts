/**
 * Armazenamento das mídias do WhatsApp — imagens, áudios, documentos e vídeos (regras puras, sem rede).
 *
 * A URL que a Meta entrega vale poucos minutos, por isso o arquivo é baixado na chegada e guardado
 * num bucket PRIVADO. `whatsapp_mensagens.media_url` guarda o CAMINHO no bucket (nunca um link
 * público); quem abre a conversa recebe um link assinado de vida curta.
 *
 * Retenção: 5 anos (decisão do responsável em 01/10/2026). Passado o prazo o arquivo é apagado
 * automaticamente; nada é apagado antes.
 */

export const BUCKET_MIDIA_WHATSAPP = "whatsapp-midia";
/** Prazo de guarda das mídias: 5 anos, contados da data de recebimento. */
export const RETENCAO_MIDIA_ANOS = 5;
/** Validade do link de visualização entregue à atendente. */
export const VALIDADE_LINK_MIDIA_S = 600;

/** Limites da própria Meta: imagem 5 MB, áudio 16 MB, vídeo 16 MB, documento 100 MB. */
export const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024;
export const LIMITE_BYTES_AUDIO = 16 * 1024 * 1024;
export const LIMITE_BYTES_VIDEO = 16 * 1024 * 1024;
export const LIMITE_BYTES_DOCUMENTO = 100 * 1024 * 1024;

export type TipoMidiaGuardada = "image" | "audio" | "document" | "video";

export function ehMidiaGuardavel(tipo: string): tipo is TipoMidiaGuardada {
  return tipo === "image" || tipo === "audio" || tipo === "document" || tipo === "video";
}

/** Documento e vídeo podem ser grandes: seguem direto para o bucket, sem carregar tudo na memória. */
export function ehArquivoEmFluxo(tipo: string): tipo is "document" | "video" {
  return tipo === "document" || tipo === "video";
}

export function limiteDeBytes(tipo: TipoMidiaGuardada): number {
  switch (tipo) {
    case "image":
      return LIMITE_BYTES_IMAGEM;
    case "audio":
      return LIMITE_BYTES_AUDIO;
    case "video":
      return LIMITE_BYTES_VIDEO;
    case "document":
      return LIMITE_BYTES_DOCUMENTO;
  }
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
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "text/plain": "txt",
  "text/csv": "csv",
};

const DOCUMENTO_OUTROS = new Set(
  Object.keys(EXTENSOES).filter((m) => m.startsWith("application/") || m.startsWith("text/")),
);

/** Tipos aceitos para guardar; qualquer outro (ex.: SVG, HTML, executável) é recusado. */
export function tipoMimeAceito(
  tipo: TipoMidiaGuardada,
  mime: string | null | undefined,
): string | null {
  const limpo = String(mime ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!limpo || !(limpo in EXTENSOES)) return null;
  if (tipo === "document") {
    // Também vale foto enviada "como documento".
    return DOCUMENTO_OUTROS.has(limpo) || limpo.startsWith("image/") ? limpo : null;
  }
  return limpo.startsWith(`${tipo}/`) ? limpo : null;
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

/** Data a partir da qual uma mídia recebida já passou dos 5 anos de guarda. */
export function dataDeCorteMidia(agora: Date = new Date()): Date {
  const corte = new Date(agora.getTime());
  corte.setUTCFullYear(corte.getUTCFullYear() - RETENCAO_MIDIA_ANOS);
  return corte;
}

export function midiaExpirada(recebidaEm: string | Date, agora: Date = new Date()): boolean {
  const t = new Date(recebidaEm).getTime();
  return Number.isFinite(t) && t < dataDeCorteMidia(agora).getTime();
}

/** Nome do arquivo para mostrar e para baixar: sem pasta, sem caracteres de controle, tamanho limitado. */
export function nomeArquivoSeguro(bruto: unknown): string {
  const nome = String(bruto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .split(/[\\/]/)
    .pop()!
    .replace(/\s+/g, " ")
    .trim();
  if (!nome || nome === "." || nome === "..") return "";
  return nome.length > 120 ? `${nome.slice(0, 117)}...` : nome;
}

const MARCA_DOCUMENTO = "📎 ";

/** Texto da mensagem de documento: "📎 nome.pdf" e, se houver, " — legenda". */
export function textoDoDocumento(nome: string, legenda?: string | null): string {
  const base = `${MARCA_DOCUMENTO}${nome || "Documento"}`;
  const extra = String(legenda ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return extra ? `${base} — ${extra}` : base;
}

/** Nome do arquivo de uma mensagem de documento (a parte antes da legenda). */
export function nomeDoDocumento(body: string | null | undefined): string {
  const texto = String(body ?? "");
  if (!texto.startsWith(MARCA_DOCUMENTO)) return "";
  const resto = texto.slice(MARCA_DOCUMENTO.length);
  const fim = resto.indexOf(" — ");
  return nomeArquivoSeguro(fim >= 0 ? resto.slice(0, fim) : resto);
}
