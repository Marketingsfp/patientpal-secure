/**
 * Número de prontuário do paciente (`pacientes.codigo_prontuario`).
 *
 * A numeração é digitada pela recepção lendo a ficha antiga em papel, então o
 * que for digitado é gravado exatamente como está. O banco só gera um número
 * automático quando o campo chega vazio num cadastro novo — é a trigger
 * `pacientes_set_codigo_prontuario`, que serve apenas de rede de segurança
 * para nenhum paciente ficar sem prontuário.
 */
import { supabase } from "@/integrations/supabase/client";
import { LIMITES, limparLinha } from "@/lib/seguranca/sanitizar";

/** Texto de ajuda exibido abaixo do campo, igual em todas as telas. */
export const AJUDA_PRONTUARIO =
  "Digite o número da ficha do paciente. Se deixar em branco, o sistema gera um número automático.";

/** Placeholder do campo, igual em todas as telas. */
export const PLACEHOLDER_PRONTUARIO = "Digite o número da ficha (ex.: 24123)";

/** Remove espaços e caracteres invisíveis; devolve null quando ficar vazio. */
export function normalizarCodigoProntuario(valor: string | null | undefined): string | null {
  const limpo = limparLinha(valor ?? "").slice(0, LIMITES.codigo);
  return limpo === "" ? null : limpo;
}

/**
 * Confere se o número já pertence a outro paciente da mesma clínica (existe
 * índice único por clínica). Devolve a mensagem pronta para exibir ao usuário,
 * ou null quando o número está livre.
 */
export async function conflitoCodigoProntuario(
  clinicaId: string,
  codigo: string | null,
  ignorarPacienteId?: string,
): Promise<string | null> {
  if (!codigo) return null;
  const { data } = await supabase
    .from("pacientes")
    .select("id, nome")
    .eq("clinica_id", clinicaId)
    .eq("codigo_prontuario", codigo)
    .limit(1);
  const usado = (data ?? [])[0];
  if (usado && usado.id !== ignorarPacienteId) {
    return `Prontuário ${codigo} já está em uso por: ${usado.nome}`;
  }
  return null;
}
