/**
 * Persistência da espera do paciente (server-only).
 *
 * O prazo vive no banco (`atend_conversas.awaiting_patient_since` e
 * `patient_response_deadline`), não no navegador: recarregar a página, fechar
 * o navegador, sair do sistema ou não ter ninguém logado não afeta o prazo.
 * Nenhum `setTimeout` de frontend participa disso.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  avaliarEsperaPaciente,
  calcularPrazoEspera,
  timeoutRespostaPacienteMinutos,
  type MotivoEspera,
} from "./espera-paciente";

export type ResultadoEspera = {
  aguardando: boolean;
  motivo: MotivoEspera;
  deadline: string | null;
};

/**
 * Chamada logo depois de a Nina enviar uma mensagem.
 * Abre a espera só quando a mensagem exige resposta; caso contrário limpa
 * qualquer prazo pendente (a Nina seguiu sozinha, não há o que esperar).
 */
export async function registrarEsperaAposRespostaNina(args: {
  clinicaId: string;
  conversaId: string | null;
  resposta: string;
  agora?: Date;
}): Promise<ResultadoEspera> {
  const avaliacao = avaliarEsperaPaciente(args.resposta);
  if (!args.conversaId) {
    return { aguardando: avaliacao.aguardando, motivo: avaliacao.motivo, deadline: null };
  }

  if (!avaliacao.aguardando) {
    await limparEsperaPaciente(args.clinicaId, args.conversaId);
    return { aguardando: false, motivo: null, deadline: null };
  }

  const prazo = calcularPrazoEspera(args.agora ?? new Date(), timeoutRespostaPacienteMinutos());
  try {
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        awaiting_patient_since: prazo.awaiting_patient_since,
        patient_response_deadline: prazo.patient_response_deadline,
      } as never)
      .eq("id", args.conversaId)
      .eq("clinica_id", args.clinicaId);
  } catch (e) {
    console.error("[nina-espera] falha ao registrar prazo", e);
  }
  return {
    aguardando: true,
    motivo: avaliacao.motivo,
    deadline: prazo.patient_response_deadline,
  };
}

/** Paciente respondeu, conversa foi resolvida ou assumida: prazo cai. */
export async function limparEsperaPaciente(
  clinicaId: string,
  conversaId: string | null,
): Promise<void> {
  if (!conversaId) return;
  try {
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        awaiting_patient_since: null,
        patient_response_deadline: null,
      } as never)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    console.error("[nina-espera] falha ao limpar prazo", e);
  }
}

/** Limpa por telefone (o webhook conhece o número antes da conversa). */
export async function limparEsperaPorTelefone(
  clinicaId: string,
  telefone: string,
): Promise<void> {
  const digits = String(telefone ?? "").replace(/\D/g, "");
  if (!digits) return;
  try {
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        awaiting_patient_since: null,
        patient_response_deadline: null,
      } as never)
      .eq("clinica_id", clinicaId)
      .in("contato_telefone", [digits, `+${digits}`])
      .not("patient_response_deadline", "is", null);
  } catch (e) {
    console.error("[nina-espera] falha ao limpar prazo por telefone", e);
  }
}
