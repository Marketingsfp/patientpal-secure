/**
 * Regras puras do protocolo no encaminhamento da Nina para atendimento humano.
 *
 * A lógica é IDÊNTICA em produção, homologação, leads de teste e testes
 * automatizados. O que muda é só o transporte da mensagem (WhatsApp real x
 * marcador interno), nunca a decisão de gerar/vincular o protocolo.
 */

/** Ambiente de execução do handoff — informação de auditoria, não de regra. */
export type AmbienteHandoff = "producao" | "homologacao";

export function ambienteDoHandoff(isTeste: boolean | null | undefined): AmbienteHandoff {
  return isTeste ? "homologacao" : "producao";
}

/** Vínculo do protocolo com o evento de handoff que o justificou. */
export type VinculoProtocoloHandoff = {
  conversation_id: string;
  handoff_event_id: string | null;
  protocol_number: string;
  created_at: string;
  environment: AmbienteHandoff;
};

export function vinculoProtocolo(args: {
  conversaId: string;
  handoffEventoId?: string | null;
  protocolo: string;
  criadoEm?: string;
  ambiente: AmbienteHandoff;
}): VinculoProtocoloHandoff {
  return {
    conversation_id: args.conversaId,
    handoff_event_id: args.handoffEventoId ?? null,
    protocol_number: args.protocolo,
    created_at: args.criadoEm ?? new Date().toISOString(),
    environment: args.ambiente,
  };
}

/**
 * Idempotência: o número já existente do ciclo é reaproveitado. Só há algo a
 * anunciar quando o protocolo existe e ainda não foi informado ao paciente.
 */
export function deveInformarProtocolo(args: {
  protocolo: string | null | undefined;
  jaInformado: boolean;
}): boolean {
  return Boolean(args.protocolo) && !args.jaInformado;
}

/**
 * Homologação usa número SIMULADO (ex.: MJ-TESTE-482913): a conversa de teste
 * nunca consome a sequência real da clínica, que fica só para atendimentos reais.
 */
export function protocoloSimulado(prefixo: string, agora: Date = new Date()): string {
  return `${prefixo}-TESTE-${String(agora.getTime() % 1_000_000).padStart(6, "0")}`;
}

export function ehProtocoloSimulado(protocolo: string | null | undefined): boolean {
  return /-TESTE-\d+$/.test(protocolo ?? "");
}

/** Mesmo ciclo de atendimento reaproveita o número (regra idêntica à do banco). */
export function reaproveitaProtocolo(args: {
  atual: string | null | undefined;
  sessaoAtual: string | null | undefined;
  sessao: string | null | undefined;
}): boolean {
  return (
    Boolean(args.atual) && (!args.sessao || !args.sessaoAtual || args.sessaoAtual === args.sessao)
  );
}
