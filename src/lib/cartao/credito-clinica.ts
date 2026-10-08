import { supabase } from "@/integrations/supabase/client";

/**
 * Situação do Crédito na clínica de um paciente (só o titular do cartão).
 * A regra inteira mora no banco — `credito_clinica_situacao` — para a tela e
 * o gatilho que valida o uso nunca discordarem.
 */
export interface CreditoClinica {
  /** Pode usar agora (tem crédito, 6 mensalidades pagas ou renovação, sem atraso). */
  apto: boolean;
  /** Por que não pode: carência (faltam mensalidades) ou atraso no contrato. */
  motivo: "carencia" | "atraso" | null;
  contratoId: string;
  convenioNome: string;
  faltamMensalidades: number;
  limite: number;
  usado: number;
  disponivel: number;
  /** Data (YYYY-MM-DD) em que o limite deve ser revisado. */
  proximaRevisao: string | null;
  revisaoPendente: boolean;
}

interface SituacaoBanco {
  apto: boolean;
  motivo: string | null;
  contrato_id?: string;
  convenio_nome?: string;
  faltam_mensalidades?: number;
  limite?: number;
  usado?: number;
  disponivel?: number;
  proxima_revisao?: string | null;
  revisao_pendente?: boolean;
}

/** null = o paciente não tem Crédito na clínica (ou a consulta falhou). */
export async function carregarCreditoClinica(
  pacienteId: string,
  clinicaId: string,
): Promise<CreditoClinica | null> {
  const { data, error } = await supabase.rpc("credito_clinica_situacao" as never, {
    _paciente_id: pacienteId,
    _clinica_id: clinicaId,
  } as never);
  if (error || !data) return null;
  const s = data as unknown as SituacaoBanco;
  if (!s.contrato_id) return null;
  return {
    apto: !!s.apto,
    motivo: s.motivo === "carencia" || s.motivo === "atraso" ? s.motivo : null,
    contratoId: s.contrato_id,
    convenioNome: s.convenio_nome ?? "",
    faltamMensalidades: Number(s.faltam_mensalidades ?? 0),
    limite: Number(s.limite ?? 0),
    usado: Number(s.usado ?? 0),
    disponivel: Number(s.disponivel ?? 0),
    proximaRevisao: s.proxima_revisao ?? null,
    revisaoPendente: !!s.revisao_pendente,
  };
}
