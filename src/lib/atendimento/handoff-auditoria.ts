/**
 * FASE 6 — Auditoria de ponta a ponta do handoff (protocolo + mensagem).
 *
 * Módulo PURO (sem banco, sem rede). Ele define o registro único que permite
 * responder, para qualquer transferência:
 *
 *   qual protocolo foi enviado, em qual mensagem, em qual handoff,
 *   em qual ciclo e em qual ambiente.
 *
 * A regra de negócio é a MESMA em produção e em teste. A única diferença
 * aceitável é o transporte da mensagem (WhatsApp real x console interno) e o
 * isolamento do ambiente de teste (sem atendente real, sem paciente real).
 */

import type { AmbienteHandoff } from "./protocolo-handoff";

/** Como a mensagem chegou (ou não) ao paciente. */
export type TransporteHandoff =
  | "whatsapp" // produção: saiu para o canal real
  | "test-console" // teste: ficou dentro do ambiente interno
  | "marcador_interno" // sem canal disponível: registro só na timeline
  | "nenhum"; // não houve mensagem

export type StatusEnvioHandoff = "sent" | "falhou" | "nao_enviado";

/** Registro consolidado de um handoff. */
export type RegistroAuditoriaHandoff = {
  conversation_id: string;
  /** Só existe em conversa de teste. */
  cycle_id: string | null;
  nina_session_id: string | null;
  handoff_event_id: string | null;
  protocol_id: string | null;
  protocol_number: string | null;
  created_at: string;
  handoff_reason: string;
  /** Setor estruturado; `null` = fila "Não atribuídas". */
  destination: string | null;
  destination_known: boolean;
  /** Atendente que recebeu a conversa, quando havia alguém online. */
  assigned_to: string | null;
  message_id: string | null;
  message_body: string | null;
  message_origin: "modelo" | "contingencia" | null;
  send_status: StatusEnvioHandoff;
  transport: TransporteHandoff;
  environment: AmbienteHandoff;
  /** Segunda tentativa reaproveitando o mesmo protocolo. */
  retry: boolean;
};

export type EntradaAuditoriaHandoff = {
  conversaId: string;
  cicloId?: string | null;
  ninaSessionId?: string | null;
  handoffEventoId?: string | null;
  protocoloId?: string | null;
  protocolo?: string | null;
  criadoEm?: string;
  motivo: string;
  destino?: string | null;
  atribuidaPara?: string | null;
  mensagemId?: string | null;
  mensagemTexto?: string | null;
  mensagemOrigem?: "modelo" | "contingencia" | null;
  statusEnvio?: StatusEnvioHandoff;
  transporte?: TransporteHandoff;
  ambiente: AmbienteHandoff;
  retry?: boolean;
};

export function montarRegistroAuditoriaHandoff(
  e: EntradaAuditoriaHandoff,
): RegistroAuditoriaHandoff {
  const destino = e.destino?.trim() || null;
  return {
    conversation_id: e.conversaId,
    cycle_id: e.cicloId ?? null,
    nina_session_id: e.ninaSessionId ?? null,
    handoff_event_id: e.handoffEventoId ?? null,
    protocol_id: e.protocoloId ?? null,
    protocol_number: e.protocolo ?? null,
    created_at: e.criadoEm ?? new Date().toISOString(),
    handoff_reason: e.motivo,
    destination: destino,
    destination_known: Boolean(destino),
    assigned_to: e.atribuidaPara ?? null,
    message_id: e.mensagemId ?? null,
    message_body: e.mensagemTexto ?? null,
    message_origin: e.mensagemOrigem ?? null,
    send_status: e.statusEnvio ?? (e.mensagemTexto ? "sent" : "nao_enviado"),
    transport: e.transporte ?? (e.mensagemTexto ? "marcador_interno" : "nenhum"),
    environment: e.ambiente,
    retry: Boolean(e.retry),
  };
}

/** O registro responde às cinco perguntas obrigatórias da Fase 6? */
export function auditoriaCompleta(r: RegistroAuditoriaHandoff): {
  ok: boolean;
  faltando: string[];
} {
  const faltando: string[] = [];
  if (!r.conversation_id) faltando.push("conversation_id");
  if (!r.handoff_event_id) faltando.push("handoff_event_id");
  if (!r.protocol_number) faltando.push("protocol_number");
  if (!r.handoff_reason) faltando.push("handoff_reason");
  if (!r.created_at) faltando.push("created_at");
  if (r.environment === "homologacao" && !r.cycle_id) faltando.push("cycle_id");
  // Falha de envio é um desfecho legítimo e auditável: o que não pode faltar é
  // o vínculo da tentativa (mensagem enviada -> precisa de message_id).
  if (r.send_status === "sent" && !r.message_id) faltando.push("message_id");
  return { ok: faltando.length === 0, faltando };
}

// ---------------------------------------------------------------------------
// Paridade produção x teste
// ---------------------------------------------------------------------------

/** Campos cuja diferença entre ambientes é ESPERADA (isolamento/transporte). */
export const CAMPOS_DIVERGENCIA_PERMITIDA = [
  "conversation_id",
  "cycle_id",
  "nina_session_id",
  "handoff_event_id",
  "protocol_id",
  "protocol_number",
  "created_at",
  "message_id",
  "message_body",
  "assigned_to",
  "transport",
  "environment",
] as const;

export type ResultadoParidade = {
  ok: boolean;
  /** Divergências que quebram a paridade da regra de negócio. */
  divergencias: Array<{ campo: string; producao: unknown; teste: unknown }>;
  /** Diferenças esperadas (transporte / isolamento). */
  esperadas: Array<{ campo: string; producao: unknown; teste: unknown }>;
};

/**
 * Compara um handoff de produção com o mesmo cenário em teste. A regra de
 * negócio (decisão, motivo, destino, conteúdo obrigatório, protocolo presente,
 * auditoria completa) tem de bater; só transporte e identificadores podem
 * divergir.
 */
export function compararParidadeHandoff(
  producao: RegistroAuditoriaHandoff,
  teste: RegistroAuditoriaHandoff,
): ResultadoParidade {
  const divergencias: ResultadoParidade["divergencias"] = [];
  const esperadas: ResultadoParidade["esperadas"] = [];
  const permitidos = new Set<string>(CAMPOS_DIVERGENCIA_PERMITIDA as readonly string[]);

  for (const campo of Object.keys(producao) as (keyof RegistroAuditoriaHandoff)[]) {
    const a = producao[campo];
    const b = teste[campo];
    if (a === b) continue;
    (permitidos.has(campo) ? esperadas : divergencias).push({
      campo,
      producao: a,
      teste: b,
    });
  }

  // Presença do protocolo é regra, mesmo que o número seja diferente.
  if (Boolean(producao.protocol_number) !== Boolean(teste.protocol_number))
    divergencias.push({
      campo: "protocol_number:presenca",
      producao: Boolean(producao.protocol_number),
      teste: Boolean(teste.protocol_number),
    });
  // Existir mensagem é regra; o texto exato pode variar (redação do modelo).
  if (Boolean(producao.message_body) !== Boolean(teste.message_body))
    divergencias.push({
      campo: "message_body:presenca",
      producao: Boolean(producao.message_body),
      teste: Boolean(teste.message_body),
    });

  return { ok: divergencias.length === 0, divergencias, esperadas };
}

// ---------------------------------------------------------------------------
// Segurança do ambiente de teste
// ---------------------------------------------------------------------------

export type ViolacaoSegurancaTeste =
  | "whatsapp_real"
  | "paciente_real"
  | "atendente_real"
  | "fora_do_ambiente_de_teste";

/**
 * Um handoff de teste não pode sair para o WhatsApp real, nem prender uma
 * atendente real, nem se ligar a um paciente real.
 */
export function violacoesDeSeguranca(
  r: RegistroAuditoriaHandoff,
  ctx?: { pacienteRealId?: string | null; conversaEhTeste?: boolean },
): ViolacaoSegurancaTeste[] {
  if (r.environment !== "homologacao") return [];
  const v: ViolacaoSegurancaTeste[] = [];
  if (r.transport === "whatsapp") v.push("whatsapp_real");
  if (r.assigned_to) v.push("atendente_real");
  if (ctx?.pacienteRealId) v.push("paciente_real");
  if (ctx?.conversaEhTeste === false) v.push("fora_do_ambiente_de_teste");
  return v;
}
