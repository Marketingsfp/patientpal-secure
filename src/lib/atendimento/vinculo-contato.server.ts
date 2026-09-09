import { normalizarTelefone } from "./telefone";

/** FASE 4 — métrica: quantas aberturas ainda precisaram do lookup por telefone. */
export const metricasContato = { lookupsTelefone: 0, aberturasPorVinculo: 0 };

type Cliente = {
  from: (t: string) => any;
};

/**
 * FASE 3 — telefone serve para achar CANDIDATOS, nunca para declarar
 * identidade clínica. O mesmo número pode pertencer a mãe, filho, casal etc.
 */
export type StatusContato = "EXPLICIT_LINK" | "UNIQUE_CANDIDATE" | "AMBIGUOUS" | "NO_MATCH";

export type CandidatoPaciente = { id: string; nome: string | null };

export type ContatoResolvido = {
  status: StatusContato;
  /** Só preenchido quando existe vínculo explícito confirmado. */
  pacienteId: string | null;
  /** Candidatos encontrados pelo telefone (não confirmam identidade). */
  candidatos: CandidatoPaciente[];
  /** true quando o paciente veio do vínculo direto (sem lookup por telefone). */
  viaVinculo: boolean;
  /** Mantido por compatibilidade: a leitura NUNCA grava vínculo. */
  vinculado: false;
  telefoneNorm: string | null;
};

/**
 * Resolve o contato de uma conversa SEM escrever nada:
 *
 *   1. `contato_paciente_id` (vínculo explícito) → EXPLICIT_LINK;
 *   2. telefone normalizado → candidatos (UNIQUE_CANDIDATE / AMBIGUOUS / NO_MATCH).
 *
 * Abrir a conversa não altera identidade. O vínculo só é gravado por
 * `vincularPacienteConversa`, a partir de um evento explícito de identificação.
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
    metricasContato.aberturasPorVinculo += 1;
    return {
      status: "EXPLICIT_LINK",
      pacienteId: params.contatoPacienteId,
      candidatos: [],
      viaVinculo: true,
      vinculado: false,
      telefoneNorm,
    };
  }

  if (!telefoneNorm) {
    return {
      status: "NO_MATCH",
      pacienteId: null,
      candidatos: [],
      viaVinculo: false,
      vinculado: false,
      telefoneNorm,
    };
  }

  // Duas igualdades separadas usam `idx_pacientes_tel_norm` / `tel2_norm`.
  // Nunca `limit(1)`: precisamos saber se há mais de um cadastro.
  metricasContato.lookupsTelefone += 1;
  const porColuna = async (coluna: "telefone_norm" | "telefone2_norm") => {
    const { data } = await supabase
      .from("pacientes")
      .select("id, nome")
      .eq("clinica_id", params.clinicaId)
      .eq(coluna, telefoneNorm)
      .limit(10);
    return (data ?? []) as Array<{ id: string; nome?: string | null }>;
  };

  const linhas = [...(await porColuna("telefone_norm")), ...(await porColuna("telefone2_norm"))];
  const candidatos: CandidatoPaciente[] = [];
  for (const l of linhas) {
    if (!l?.id || candidatos.some((c) => c.id === l.id)) continue;
    candidatos.push({ id: l.id, nome: l.nome ?? null });
  }

  const status: StatusContato =
    candidatos.length === 0 ? "NO_MATCH" : candidatos.length === 1 ? "UNIQUE_CANDIDATE" : "AMBIGUOUS";

  return {
    status,
    pacienteId: null,
    candidatos,
    viaVinculo: false,
    vinculado: false,
    telefoneNorm,
  };
}

export type OrigemVinculo =
  | "atendente"
  | "cadastro_rapido"
  | "nina_identificacao"
  | "fluxo_verificacao";

/**
 * Grava `contato_paciente_id` na conversa a partir de um evento EXPLÍCITO de
 * identificação (escolha da atendente, cadastro rápido, Nina com evidências).
 * Só preenche quando ainda está vazio, para não trocar silenciosamente o
 * paciente de uma conversa já vinculada.
 */
export async function vincularPacienteConversa(
  supabase: Cliente,
  params: {
    clinicaId: string;
    conversaId: string;
    pacienteId: string;
    forcar?: boolean;
    origem?: OrigemVinculo;
    responsavelUserId?: string | null;
  },
): Promise<boolean> {
  try {
    let q = supabase
      .from("atend_conversas")
      .update({ contato_paciente_id: params.pacienteId })
      .eq("id", params.conversaId)
      .eq("clinica_id", params.clinicaId);
    if (!params.forcar) q = q.is("contato_paciente_id", null);
    const { error } = await q;
    if (error) return false;
    if (params.origem) {
      // Auditoria best-effort: origem, responsável e horário do vínculo.
      try {
        await supabase.from("atend_conversa_eventos").insert({
          clinica_id: params.clinicaId,
          conversa_id: params.conversaId,
          tipo: "vinculo_paciente",
          user_id: params.responsavelUserId ?? null,
          payload: {
            paciente_id: params.pacienteId,
            origem: params.origem,
            em: new Date().toISOString(),
          },
        });
      } catch {
        /* auditoria não bloqueia o vínculo */
      }
    }
    return true;
  } catch {
    return false;
  }
}

