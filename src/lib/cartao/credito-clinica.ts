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

/** Cobrança de crédito no contrato: `contrato_mensalidades.origem`. */
export const ORIGEM_CREDITO_CLINICA = "credito_clinica";

export const ehCobrancaCredito = (m: { origem?: string | null }) =>
  m.origem === ORIGEM_CREDITO_CLINICA;

/** Formas aceitas no recebimento da cobrança (é dinheiro entrando na gaveta). */
export const FORMAS_PAGAR_CREDITO = [
  { forma: "dinheiro", label: "Dinheiro" },
  { forma: "pix", label: "PIX" },
  { forma: "debito", label: "Cartão de Débito" },
  { forma: "credito", label: "Cartão de Crédito" },
] as const;

/**
 * Recebe a cobrança do crédito: só um movimento de caixa (entra na gaveta e
 * na conferência por forma), sem lançamento de receita — o atendimento já foi
 * faturado no dia em que o crédito foi usado.
 */
export async function pagarCobrancaCredito(
  mensalidadeId: string,
  forma: string,
  bandeira: string | null,
): Promise<void> {
  const { error } = await supabase.rpc(
    "pagar_cobranca_credito_clinica" as never,
    {
      _mensalidade_id: mensalidadeId,
      _forma: forma,
      _bandeira: bandeira,
    } as never,
  );
  if (error) throw error;
}

/** Revisão de limite (alçada nominal 'credito_clinica'; o banco confere). */
export async function revisarLimiteCredito(
  contratoId: string,
  limite: number,
  observacao: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    "revisar_limite_credito_clinica" as never,
    {
      _contrato_id: contratoId,
      _limite: limite,
      _observacao: observacao,
    } as never,
  );
  if (error) throw error;
}

export interface RevisaoCredito {
  id: string;
  limiteAnterior: number | null;
  limiteNovo: number;
  observacao: string;
  criadoEm: string;
}

export async function carregarRevisoesCredito(contratoId: string): Promise<RevisaoCredito[]> {
  const { data } = await supabase
    .from("credito_clinica_revisoes" as never)
    .select("id, limite_anterior, limite_novo, observacao, created_at")
    .eq("contrato_id", contratoId)
    .order("created_at", { ascending: false });
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      limite_anterior: number | null;
      limite_novo: number;
      observacao: string;
      created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    limiteAnterior: r.limite_anterior == null ? null : Number(r.limite_anterior),
    limiteNovo: Number(r.limite_novo),
    observacao: r.observacao,
    criadoEm: r.created_at,
  }));
}

/** null = o paciente não tem Crédito na clínica (ou a consulta falhou). */
export async function carregarCreditoClinica(
  pacienteId: string,
  clinicaId: string,
): Promise<CreditoClinica | null> {
  const { data, error } = await supabase.rpc(
    "credito_clinica_situacao" as never,
    {
      _paciente_id: pacienteId,
      _clinica_id: clinicaId,
    } as never,
  );
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
