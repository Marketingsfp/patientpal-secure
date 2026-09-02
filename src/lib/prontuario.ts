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
 * Maior quantidade de dígitos aceita num número de prontuário.
 *
 * A régua vem do sistema antigo, que numerava com até 7 dígitos. O limite não
 * é estético: o número automático de um paciente novo é calculado como "maior
 * número da clínica + 1". Em 19/08/2026 alguém digitou 24378101 (o prontuário
 * 2437810 de outra paciente com um dígito a mais) e, a partir dali, todos os
 * cadastros novos passaram a nascer com 8 dígitos, fora da régua.
 */
export const MAX_DIGITOS_PRONTUARIO = 7;

/**
 * Recusa um número de prontuário fora da régua do sistema antigo.
 *
 * Só vale para números puros: alguns cadastros antigos têm letra no código e
 * continuam válidos como estão. Devolve a mensagem pronta para exibir, ou null
 * quando o número pode ser usado.
 */
export function erroCodigoProntuario(codigo: string | null | undefined): string | null {
  const limpo = (codigo ?? "").trim();
  if (!limpo) return null;
  if (/^\d+$/.test(limpo) && limpo.length > MAX_DIGITOS_PRONTUARIO) {
    return `O número de prontuário tem no máximo ${MAX_DIGITOS_PRONTUARIO} dígitos, e você digitou ${limpo.length}. Confira o número na ficha.`;
  }
  return null;
}

/**
 * Diz se o número digitado pode ser usado. Junta as duas checagens que toda
 * tela de cadastro precisa fazer: o número está dentro da régua de 7 dígitos e
 * ainda não pertence a outro paciente da mesma clínica (existe índice único por
 * clínica). Devolve a mensagem pronta para exibir ao usuário, ou null quando o
 * número está livre.
 *
 * As duas checagens moram juntas de propósito: este é o único ponto por onde
 * passam todas as telas que aceitam o número digitado — cadastro completo,
 * cadastro rápido, agenda e o assistente de novo agendamento.
 */
export async function conflitoCodigoProntuario(
  clinicaId: string,
  codigo: string | null,
  ignorarPacienteId?: string,
): Promise<string | null> {
  const foraDaRegua = erroCodigoProntuario(codigo);
  if (foraDaRegua) return foraDaRegua;
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

/** Campos mínimos para decidir qual número mostrar. */
export interface ProntuarioExibivel {
  codigo_prontuario?: string | null;
  codigo_prontuario_anterior?: string | null;
}

/**
 * Número de prontuário que deve aparecer na tela.
 *
 * A importação do sistema antigo (junho/2026) gravou a numeração histórica em
 * `codigo_prontuario_anterior` e gerou um número interno novo em
 * `codigo_prontuario`. Para a recepção, o número que vale é o histórico — é ele
 * que está na ficha de papel e nos documentos antigos. Quem foi cadastrado já
 * no sistema novo não tem histórico e continua com o número interno.
 *
 * Usar só para exibir e imprimir. Cadastro, busca por código e checagem de
 * duplicidade continuam em `codigo_prontuario`, que é a coluna com índice único.
 */
export function prontuarioExibicao(p: ProntuarioExibivel | null | undefined): string | null {
  const antigo = (p?.codigo_prontuario_anterior ?? "").trim();
  if (antigo) return antigo;
  return (p?.codigo_prontuario ?? "").trim() || null;
}
