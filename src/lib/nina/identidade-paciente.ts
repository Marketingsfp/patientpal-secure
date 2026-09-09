/**
 * FASE 4 — identidade do paciente na Nina.
 *
 * Regra determinística (não depende do prompt): o telefone do WhatsApp
 * identifica o CONTATO, nunca confirma sozinho o PACIENTE clínico.
 * Um mesmo número pode pertencer a mãe, filho, casal, dependente etc.
 */

export type StatusIdentidade = "NONE" | "UNIQUE_CANDIDATE" | "AMBIGUOUS" | "CONFIRMED";

export type CandidatoPacienteNina = {
  id: string;
  nome: string | null;
  associado: boolean;
  convenio_nome: string | null;
};

export type BuscaIdentidade = {
  /** Candidatos devolvidos pela RPC, sem escolher nenhum. */
  candidates: CandidatoPacienteNina[];
  /** true quando a busca usou CPF informado pela própria pessoa. */
  viaCpf: boolean;
};

export type IdentidadeResolvida = {
  status: StatusIdentidade;
  candidates: CandidatoPacienteNina[];
  /** Só preenchido quando `status === "CONFIRMED"`. */
  paciente: CandidatoPacienteNina | null;
};

/**
 * Classifica os candidatos SEM escolher `rows[0]`.
 *
 * - CPF informado + um único cadastro → CONFIRMED (a pessoa provou quem é);
 * - identidade já confirmada nesta conversa + um único candidato → CONFIRMED;
 * - um candidato apenas pelo telefone → UNIQUE_CANDIDATE (compatível, não provado);
 * - dois ou mais candidatos → AMBIGUOUS;
 * - nenhum → NONE.
 */
export function resolverIdentidadePaciente(
  busca: BuscaIdentidade | null,
  opts: { confirmadoNaConversa?: boolean; pacienteVinculadoId?: string | null } = {},
): IdentidadeResolvida {
  const candidates = (busca?.candidates ?? []).filter((c) => c && c.id);

  // Vínculo explícito já gravado na conversa vale como identidade confirmada.
  if (opts.pacienteVinculadoId) {
    const doVinculo =
      candidates.find((c) => c.id === opts.pacienteVinculadoId) ??
      ({
        id: opts.pacienteVinculadoId,
        nome: null,
        associado: false,
        convenio_nome: null,
      } as CandidatoPacienteNina);
    return { status: "CONFIRMED", candidates, paciente: doVinculo };
  }

  if (candidates.length === 0) return { status: "NONE", candidates: [], paciente: null };

  if (candidates.length === 1) {
    const unico = candidates[0]!;
    if (busca?.viaCpf || opts.confirmadoNaConversa) {
      return { status: "CONFIRMED", candidates, paciente: unico };
    }
    return { status: "UNIQUE_CANDIDATE", candidates, paciente: null };
  }

  return { status: "AMBIGUOUS", candidates, paciente: null };
}

/**
 * Fatos do remetente enviados ao modelo. Nome, convênio e benefício só saem
 * quando a identidade está CONFIRMADA — candidato ambíguo ou não validado
 * nunca vira dado clínico no contexto (LGPD/minimização).
 */
export function fatosRemetente(id: IdentidadeResolvida) {
  if (id.status === "CONFIRMED" && id.paciente) {
    return {
      cadastro_encontrado: true,
      identidade_confirmada: true,
      nome: id.paciente.nome ?? null,
      associado: Boolean(id.paciente.associado),
      convenio: id.paciente.associado
        ? (id.paciente.convenio_nome ?? "Cartão Benefícios")
        : null,
      candidatos: 1,
    };
  }
  return {
    cadastro_encontrado: id.candidates.length > 0,
    identidade_confirmada: false,
    nome: null,
    associado: false,
    convenio: null,
    candidatos: id.candidates.length,
  };
}

/** Nome que a Nina pode usar para se dirigir à pessoa neste turno. */
export function primeiroNomeSeguro(
  id: IdentidadeResolvida,
  nomeContatoWhatsapp?: string | null,
): string | null {
  if (id.status === "CONFIRMED" && id.paciente?.nome) {
    return id.paciente.nome.split(" ")[0] ?? null;
  }
  const contato = (nomeContatoWhatsapp ?? "").trim();
  if (!contato || /^\+?\d[\d\s()-]*$/.test(contato)) return null;
  return contato.split(" ")[0] ?? null;
}
