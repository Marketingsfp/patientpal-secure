import { supabase } from "@/integrations/supabase/client";
import { detectDescriptor } from "@/lib/face-recognition";

/**
 * Extrai o descritor facial (128 números) de uma foto já capturada/enviada.
 * Retorna null se nenhum rosto for detectado na imagem. Browser-only.
 */
export async function descriptorDaFoto(foto: Blob): Promise<number[] | null> {
  const url = URL.createObjectURL(foto);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const desc = await detectDescriptor(img);
    return desc ? Array.from(desc) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Revoga a biometria ativa do paciente e registra a nova (padrão do cadastro:
 * nunca manter dois descritores ativos). Retorna o erro do Supabase, se houver.
 */
export async function registrarBiometriaPaciente(
  pacienteId: string,
  clinicaId: string,
  descriptor: number[],
) {
  await supabase
    .from("paciente_biometria")
    .update({ revogado_em: new Date().toISOString() })
    .eq("paciente_id", pacienteId)
    .eq("clinica_id", clinicaId)
    .is("revogado_em", null);
  const { error } = await supabase.from("paciente_biometria").insert({
    paciente_id: pacienteId,
    clinica_id: clinicaId,
    descriptor,
    consentimento_em: new Date().toISOString(),
  });
  return error;
}
