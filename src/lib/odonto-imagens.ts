import { supabase } from "@/integrations/supabase/client";

export type OdontoImagemCategoria =
  | "intraoral"
  | "extraoral"
  | "radiografia_periapical"
  | "radiografia_panoramica"
  | "tomografia"
  | "foto_documentacao"
  | "outro";

export const CATEGORIA_LABEL: Record<OdontoImagemCategoria, string> = {
  intraoral: "Foto intraoral",
  extraoral: "Foto extraoral",
  radiografia_periapical: "RX Periapical",
  radiografia_panoramica: "RX Panorâmica",
  tomografia: "Tomografia",
  foto_documentacao: "Documentação",
  outro: "Outro",
};

export interface OdontoImagem {
  id: string;
  clinica_id: string;
  paciente_id: string;
  prontuario_id: string | null;
  storage_path: string;
  mime_type: string;
  tamanho_bytes: number | null;
  largura: number | null;
  altura: number | null;
  categoria: OdontoImagemCategoria;
  dentes: number[];
  data_exame: string;
  descricao: string | null;
  tags: string[];
  criado_por: string | null;
  deletado_em: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = "odonto-imagens";
const MAX_DIM = 2000;
const QUALITY = 0.85;

/** Redimensiona/comprime a imagem no navegador antes do upload. */
export async function comprimirImagem(file: File): Promise<{
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}> {
  // Radiografias/tomografias em DICOM ou formatos não-raster: envia como está.
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return { blob: file, width: 0, height: 0, mime: file.type || "application/octet-stream" };
  }
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, width, height, mime: file.type };
  ctx.drawImage(bitmap, 0, 0, width, height);
  const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), outMime, QUALITY),
  );
  return { blob, width, height, mime: outMime };
}

export function extForMime(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("dicom")) return "dcm";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

export interface UploadInput {
  clinicaId: string;
  pacienteId: string;
  file: File;
  categoria: OdontoImagemCategoria;
  dataExame: string;
  dentes: number[];
  descricao: string | null;
  tags: string[];
  criadoPor: string | null;
  prontuarioId?: string | null;
}

export async function uploadOdontoImagem(input: UploadInput): Promise<OdontoImagem> {
  const { blob, width, height, mime } = await comprimirImagem(input.file);
  const uuid = crypto.randomUUID();
  const path = `${input.clinicaId}/${input.pacienteId}/${uuid}.${extForMime(mime)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("odonto_imagens")
    .insert({
      clinica_id: input.clinicaId,
      paciente_id: input.pacienteId,
      prontuario_id: input.prontuarioId ?? null,
      storage_path: path,
      mime_type: mime,
      tamanho_bytes: blob.size,
      largura: width || null,
      altura: height || null,
      categoria: input.categoria,
      dentes: input.dentes,
      data_exame: input.dataExame,
      descricao: input.descricao,
      tags: input.tags,
      criado_por: input.criadoPor,
    })
    .select("*")
    .single();
  if (error) {
    // rollback storage
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data as OdontoImagem;
}

export async function listarOdontoImagens(
  clinicaId: string,
  pacienteId: string,
): Promise<OdontoImagem[]> {
  const { data, error } = await supabase
    .from("odonto_imagens")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .is("deletado_em", null)
    .order("data_exame", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OdontoImagem[];
}

export async function urlAssinada(path: string, expiresSec = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) return null;
  return data.signedUrl;
}

export async function urlsAssinadas(paths: string[], expiresSec = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresSec);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export async function softDeleteOdontoImagem(id: string): Promise<void> {
  const { error } = await supabase
    .from("odonto_imagens")
    .update({ deletado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function atualizarOdontoImagem(
  id: string,
  patch: Partial<Pick<OdontoImagem, "categoria" | "data_exame" | "descricao" | "dentes" | "tags">>,
): Promise<void> {
  const { error } = await supabase.from("odonto_imagens").update(patch).eq("id", id);
  if (error) throw error;
}