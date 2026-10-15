/**
 * Compressor para foto de DOCUMENTO (pedido médico). Separado de `comprimirImagem` (odonto):
 * texto pequeno pede resolução alta, e a foto do iPhone precisa respeitar a rotação do EXIF.
 */
const MAX_DIM = 3500;
const QUALITY = 0.92;

export type DocumentoComprimido = {
  blob: Blob;
  mime: string;
  larguraOriginal: number;
  alturaOriginal: number;
  largura: number;
  altura: number;
};

const NATIVO = /^image\/(jpeg|png|webp)$/i;

export async function comprimirDocumento(file: File): Promise<DocumentoComprimido> {
  const original: DocumentoComprimido = {
    blob: file,
    mime: file.type || "image/jpeg",
    larguraOriginal: 0,
    alturaOriginal: 0,
    largura: 0,
    altura: 0,
  };
  let bitmap: ImageBitmap;
  try {
    // Qualquer image/* (inclusive HEIC no Safari). Falhou: manda o original para o servidor.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return original;
  }
  const w0 = bitmap.width;
  const h0 = bitmap.height;
  const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
  // Já cabe e o formato é aceito: não reamostra nem reencoda.
  if (scale === 1 && NATIVO.test(file.type)) {
    bitmap.close?.();
    return { ...original, larguraOriginal: w0, alturaOriginal: h0, largura: w0, altura: h0 };
  }
  const largura = Math.round(w0 * scale);
  const altura = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ...original, larguraOriginal: w0, alturaOriginal: h0 };
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();
  const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outMime, QUALITY),
  );
  if (!blob) return { ...original, larguraOriginal: w0, alturaOriginal: h0 };
  return { blob, mime: outMime, larguraOriginal: w0, alturaOriginal: h0, largura, altura };
}
