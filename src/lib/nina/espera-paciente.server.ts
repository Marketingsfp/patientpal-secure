/**
 * Persistência da espera do paciente (server-only).
 *
 * O prazo vive no banco (`atend_conversas.awaiting_patient_since` e
 * `patient_response_deadline`), não no navegador: recarregar a página, fechar
 * o navegador, sair do sistema ou não ter ninguém logado não afeta o prazo.
 * Nenhum `setTimeout` de frontend participa disso.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { conversaResolvida } from "@/lib/atendimento/ciclo-responsabilidade";
import {
  avaliarEsperaPaciente,
  calcularPrazoEspera,
  timeoutAindaValido,
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
 * Confere a mensagem persistida e a responsabilidade antes de abrir a espera.
 * O UPDATE condicionado impede que uma resposta concorrente do paciente,
 * encerramento, reset ou atribuição humana arme um relógio obsoleto.
 */
export async function registrarEsperaAposRespostaNina(args: {
  clinicaId: string;
  conversaId: string | null;
  resposta: string;
  agora?: Date;
}): Promise<ResultadoEspera> {
  const avaliacao = avaliarEsperaPaciente(args.resposta);
  if (!args.conversaId) {
    return { aguardando: false, motivo: null, deadline: null };
  }

  if (!avaliacao.aguardando) {
    return { aguardando: false, motivo: null, deadline: null };
  }

  const semEspera: ResultadoEspera = { aguardando: false, motivo: null, deadline: null };
  try {
    const { data: conversa, error: erroConversa } = await supabaseAdmin
      .from("atend_conversas")
      .select(
        "owner_type,ai_enabled,atribuida_user_id,status,ultima_msg_em,nina_fluxo_estado,awaiting_patient_since,patient_response_deadline",
      )
      .eq("id", args.conversaId)
      .eq("clinica_id", args.clinicaId)
      .maybeSingle();
    if (erroConversa) throw erroConversa;
    if (
      !conversa ||
      !conversa.ultima_msg_em ||
      conversa.owner_type !== "AI" ||
      conversa.ai_enabled !== true ||
      conversa.atribuida_user_id ||
      conversaResolvida(conversa)
    )
      return semEspera;
    const ultima = await ultimaMensagemDaConversa(args.clinicaId, args.conversaId);
    if (!mensagemEnviadaPelaNina(ultima)) return semEspera;
    const estado = conversa.nina_fluxo_estado as {
      session_id?: string;
      session_started_at?: string;
    } | null;
    if (
      estado?.session_started_at &&
      Date.parse(ultima!.created_at) < Date.parse(estado.session_started_at)
    )
      return semEspera;
    // Retomar a mesma saída confirmada não deve reiniciar os 30 minutos.
    if (
      conversa.awaiting_patient_since &&
      conversa.patient_response_deadline &&
      Date.parse(ultima!.created_at) <= Date.parse(conversa.awaiting_patient_since)
    ) {
      return {
        aguardando: true,
        motivo: avaliacao.motivo,
        deadline: conversa.patient_response_deadline,
      };
    }
    const prazo = calcularPrazoEspera(args.agora ?? new Date(), timeoutRespostaPacienteMinutos());
    let atualizacao = supabaseAdmin
      .from("atend_conversas")
      .update({
        awaiting_patient_since: prazo.awaiting_patient_since,
        patient_response_deadline: prazo.patient_response_deadline,
      } as never)
      .eq("id", args.conversaId)
      .eq("clinica_id", args.clinicaId)
      .eq("owner_type", "AI")
      .eq("ai_enabled", true)
      .is("atribuida_user_id", null)
      .eq("ultima_msg_em", conversa.ultima_msg_em)
      .not("status", "in", '("closed","finished","resolved","resolvida","fechada","encerrada")');
    atualizacao = estado?.session_id
      ? atualizacao.eq("nina_fluxo_estado->>session_id", estado.session_id)
      : atualizacao.is("nina_fluxo_estado->>session_id", null);
    atualizacao = conversa.patient_response_deadline
      ? atualizacao.eq("patient_response_deadline", conversa.patient_response_deadline)
      : atualizacao.is("patient_response_deadline", null);
    const { data, error } = await atualizacao.select("id");
    if (error) throw error;
    if (!data?.length) return semEspera;
    return {
      aguardando: true,
      motivo: avaliacao.motivo,
      deadline: prazo.patient_response_deadline,
    };
  } catch (e) {
    console.error("[nina-espera] falha ao registrar prazo", e);
    return semEspera;
  }
}

export type MensagemEspera = {
  id: string;
  direction: string;
  enviada_por: string | null;
  status: string | null;
  created_at: string;
  body: string | null;
};

/** Inclui entradas e saídas; marcadores internos não são mensagens ao paciente. */
export async function ultimaMensagemDaConversa(
  clinicaId: string,
  conversaId: string,
): Promise<MensagemEspera | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_mensagens")
    .select("id,direction,enviada_por,status,created_at,body")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .neq("status", "system")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MensagemEspera | null;
}

export function mensagemEnviadaPelaNina(m: MensagemEspera | null): boolean {
  return (
    !!m &&
    m.direction === "out" &&
    m.enviada_por === "nina" &&
    ["sent", "delivered", "read"].includes(m.status ?? "")
  );
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
  mensagemRecebidaEm?: string,
): Promise<void> {
  const digits = String(telefone ?? "").replace(/\D/g, "");
  if (!digits) return;
  try {
    let atualizacao = supabaseAdmin
      .from("atend_conversas")
      .update({
        awaiting_patient_since: null,
        patient_response_deadline: null,
      } as never)
      .eq("clinica_id", clinicaId)
      .in("contato_telefone", [digits, `+${digits}`])
      .not("patient_response_deadline", "is", null);
    // Um webhook lento não pode apagar o prazo de uma resposta posterior da Nina.
    if (mensagemRecebidaEm)
      atualizacao = atualizacao.lte("awaiting_patient_since", mensagemRecebidaEm);
    const { error } = await atualizacao;
    if (error) throw error;
  } catch (e) {
    console.error("[nina-espera] falha ao limpar prazo por telefone", e);
  }
}

/** Versão por telefone: o webhook conhece o número, não o id da conversa. */
export async function registrarEsperaPorTelefone(args: {
  clinicaId: string;
  telefone: string;
  resposta: string;
}): Promise<ResultadoEspera> {
  const digits = String(args.telefone ?? "").replace(/\D/g, "");
  if (!digits) return { aguardando: false, motivo: null, deadline: null };
  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select("id")
    .eq("clinica_id", args.clinicaId)
    .in("contato_telefone", [digits, `+${digits}`])
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return registrarEsperaAposRespostaNina({
    clinicaId: args.clinicaId,
    conversaId: (data as { id?: string } | null)?.id ?? null,
    resposta: args.resposta,
  });
}

/**
 * Relê o estado da conversa antes de qualquer ação por vencimento.
 * Se o paciente respondeu (prazo limpo) ou uma pergunta nova criou outro
 * ciclo, isto devolve `false` e nenhum job antigo mexe na conversa.
 */
export async function timeoutPendenteConfirmado(args: {
  clinicaId: string;
  conversaId: string;
  deadlineEsperado?: string | null;
  agora?: Date;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("atend_conversas")
    .select("patient_response_deadline, status")
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();
  if (error || !data) return false;
  const linha = data as { patient_response_deadline?: string | null; status?: string | null };
  const encerrada = ["resolvida", "fechada", "closed", "resolved"].includes(
    String(linha.status ?? "").toLowerCase(),
  );
  if (encerrada) return false;
  return timeoutAindaValido({
    deadlineAtual: linha.patient_response_deadline ?? null,
    deadlineEsperado: args.deadlineEsperado ?? null,
    agora: args.agora ?? new Date(),
  });
}
