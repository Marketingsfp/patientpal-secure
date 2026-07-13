import { supabase } from "@/integrations/supabase/client";

export interface DependenteIncluido {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  incluido_em: string;
  excluido_em: string | null;
  ativo: boolean;
}

export type IncluirDependenteResultado =
  | { ok: true; dependente: DependenteIncluido }
  | { ok: false; mensagem: string; error?: unknown };

/**
 * Rotina única para incluir dependente num contrato de assinatura.
 * Três telas diferentes inseriam direto em contrato_dependentes, cada uma
 * com sua própria (ou nenhuma) validação de limite/duplicidade/titular —
 * a regra do plano podia ser burlada por quem passasse pela tela sem
 * checagem. Centraliza a validação aqui (o banco também bloqueia via
 * trigger trg_contrato_dependentes_validar, como última linha de defesa).
 */
export async function incluirDependenteContrato(params: {
  contratoId: string;
  pacienteId: string;
  pacienteNome: string;
  parentesco?: string | null;
  tipo?: string;
}): Promise<IncluirDependenteResultado> {
  const { contratoId, pacienteId, pacienteNome, parentesco, tipo } = params;

  const { data: contrato, error: eContrato } = await supabase
    .from("contratos_assinatura")
    .select("id, paciente_id, status, convenio_id, plano_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (eContrato) return { ok: false, mensagem: "Falha ao buscar o contrato.", error: eContrato };
  if (!contrato) return { ok: false, mensagem: "Contrato não encontrado." };
  if (contrato.status === "cancelado") {
    return { ok: false, mensagem: "Este contrato está cancelado — não é possível incluir dependentes." };
  }
  if (contrato.paciente_id === pacienteId) {
    return { ok: false, mensagem: "O titular não pode ser dependente do próprio contrato." };
  }

  const { data: ativos, error: eAtivos } = await supabase
    .from("contrato_dependentes")
    .select("id, paciente_id")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);
  if (eAtivos) return { ok: false, mensagem: "Falha ao checar dependentes atuais.", error: eAtivos };
  const ativosRows = (ativos ?? []) as Array<{ id: string; paciente_id: string }>;
  if (ativosRows.some((d) => d.paciente_id === pacienteId)) {
    return { ok: false, mensagem: "Esse paciente já é dependente ativo deste contrato." };
  }

  let maxDep = 0;
  if (contrato.convenio_id) {
    const { data: conv } = await supabase
      .from("cb_convenios")
      .select("max_dependentes")
      .eq("id", contrato.convenio_id)
      .maybeSingle();
    maxDep = Number((conv as { max_dependentes?: number } | null)?.max_dependentes ?? 0) || 0;
  } else if (contrato.plano_id) {
    const { data: plano } = await supabase
      .from("planos_assinatura")
      .select("max_dependentes")
      .eq("id", contrato.plano_id)
      .maybeSingle();
    maxDep = Number((plano as { max_dependentes?: number } | null)?.max_dependentes ?? 0) || 0;
  }
  if (ativosRows.length >= maxDep) {
    return {
      ok: false,
      mensagem: maxDep === 0 ? "Este plano/convênio não permite dependentes." : `Limite de ${maxDep} dependentes atingido.`,
    };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("contrato_dependentes")
    .insert({
      contrato_id: contratoId,
      paciente_id: pacienteId,
      paciente_nome: pacienteNome,
      parentesco: parentesco?.trim() || null,
      tipo: tipo || "dependente",
      incluido_em: hoje,
      ativo: true,
    } as never)
    .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
    .single();
  if (error) {
    // Trava de banco (trigger) é a última linha de defesa contra corrida —
    // mesma mensagem amigável de duplicidade caso a checagem acima perca.
    const mensagem = (error as { code?: string }).code === "23505"
      ? "Esse paciente já é dependente ativo deste contrato."
      : "Falha ao incluir dependente.";
    return { ok: false, mensagem, error };
  }
  return { ok: true, dependente: data as unknown as DependenteIncluido };
}
