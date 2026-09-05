import { normalizarTelefone } from "./telefone";

type Cliente = {
  from: (t: string) => any;
};

export type ContatoResolvido = {
  pacienteId: string | null;
  /** true quando o paciente veio do vínculo direto (sem lookup por telefone). */
  viaVinculo: boolean;
  /** true quando o vínculo foi gravado agora na conversa. */
  vinculado: boolean;
  telefoneNorm: string | null;
};

/**
 * Resolve o paciente de uma conversa com a prioridade da Fase 2:
 *
 *   1. `contato_paciente_id` (vínculo direto) — se existir, NÃO faz lookup por telefone;
 *   2. `contato_telefone` normalizado — busca indexada por `telefone_norm`.
 *
 * Quando encontra pelo telefone, grava o vínculo na conversa para que as
 * próximas aberturas usem o caminho 1. Nunca cria paciente automaticamente.
 */
export async function resolverContatoConversa(
  supabase: Cliente,
  params: {
    clinicaId: string;
    conversaId: string;
    contatoPacienteId?: string | null;
    contatoTelefone?: string | null;
  },
): Promise<ContatoResolvido> {
  const telefoneNorm = normalizarTelefone(params.contatoTelefone);

  if (params.contatoPacienteId) {
    return {
      pacienteId: params.contatoPacienteId,
      viaVinculo: true,
      vinculado: false,
      telefoneNorm,
    };
  }

  if (!telefoneNorm) {
    return { pacienteId: null, viaVinculo: false, vinculado: false, telefoneNorm };
  }

  // FASE 4 — o `OR` impedia o uso dos índices (Seq Scan ~47ms). Duas
  // igualdades separadas usam `idx_pacientes_tel_norm` / `tel2_norm` (~0,07ms).
  metricasContato.lookupsTelefone += 1;
  const porColuna = async (coluna: "telefone_norm" | "telefone2_norm") => {
    const { data } = await supabase
      .from("pacientes")
      .select("id")
      .eq("clinica_id", params.clinicaId)
      .eq(coluna, telefoneNorm)
      .limit(1)
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  };

  const pacienteId = (await porColuna("telefone_norm")) ?? (await porColuna("telefone2_norm"));
  if (!pacienteId) {
    return { pacienteId: null, viaVinculo: false, vinculado: false, telefoneNorm };
  }

  const vinculado = await vincularPacienteConversa(supabase, {
    clinicaId: params.clinicaId,
    conversaId: params.conversaId,
    pacienteId,
  });

  return { pacienteId, viaVinculo: false, vinculado, telefoneNorm };
}

/**
 * Grava `contato_paciente_id` na conversa (cadastro rápido, vínculo manual ou
 * identificação da Nina). Só preenche quando ainda está vazio, para não
 * trocar silenciosamente o paciente de uma conversa já vinculada.
 */
export async function vincularPacienteConversa(
  supabase: Cliente,
  params: { clinicaId: string; conversaId: string; pacienteId: string; forcar?: boolean },
): Promise<boolean> {
  try {
    let q = supabase
      .from("atend_conversas")
      .update({ contato_paciente_id: params.pacienteId })
      .eq("id", params.conversaId)
      .eq("clinica_id", params.clinicaId);
    if (!params.forcar) q = q.is("contato_paciente_id", null);
    const { error } = await q;
    return !error;
  } catch {
    return false;
  }
}
