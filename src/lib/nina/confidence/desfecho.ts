/**
 * FASE 4 — DESFECHOS EXPLÍCITOS DO TURNO (camada pura).
 *
 * Três coisas diferentes precisavam parar de se confundir:
 *
 *   - a decisão RECOMENDADA pelo motor de confiança;
 *   - a decisão APLICADA pela etapa de ativação da clínica;
 *   - o RESULTADO EFETIVO (a transferência aconteceu mesmo?).
 *
 * Regras inegociáveis deste módulo:
 *
 *   - transferência só é ANUNCIADA depois que o serviço de handoff confirma;
 *   - se a transferência falhar, o paciente recebe uma resposta verdadeira
 *     sobre a limitação — NUNCA o rascunho que o motor reprovou;
 *   - o limite de rodadas tem desfecho próprio, também sem reaproveitar
 *     rascunho como se fosse resposta aprovada.
 */

export type EstadoDesfechoTurno =
  | "HANDOFF_CONFIRMADO"
  | "HANDOFF_FALHOU"
  | "LIMITE_RODADAS"
  | "ESCLARECIMENTO_EMITIDO";

export const TEXTO_HANDOFF_CONFIRMADO =
  "Para não te passar uma informação errada, vou chamar uma atendente da nossa equipe para confirmar isso com você.";

export const TEXTO_HANDOFF_FALHOU =
  "Não consegui confirmar essa informação com segurança agora e também não consegui transferir seu atendimento neste momento. Seu contato ficou registrado aqui e nossa equipe vai continuar com você por esta conversa.";

export const TEXTO_LIMITE_RODADAS =
  "Não consegui concluir isso por aqui agora. Vou deixar seu atendimento registrado para que nossa equipe continue com você por esta conversa.";

export type DesfechoTurno = {
  estado: EstadoDesfechoTurno;
  /** Texto que vai ao paciente. Nunca é o rascunho reprovado. */
  resposta: string;
  /** Origem do texto para o rastreio do turno. */
  origem: "codigo";
  /** A transferência realmente aconteceu no serviço de handoff. */
  handoffConfirmado: boolean;
  /** A conversa precisa ser retomada por uma pessoa (estado recuperável). */
  requerRetomadaHumana: boolean;
  /** Frase curta e auditável do que aconteceu. */
  explicacao: string;
  /** Erro real devolvido pelo serviço de transferência, quando houve. */
  erro?: string | null;
};

/**
 * Desfecho de um turno que decidiu transferir.
 *
 * @param confirmado resultado REAL do serviço de transferência.
 */
export function desfechoDeHandoff(entrada: {
  confirmado: boolean;
  motivo: string;
  erro?: string | null;
}): DesfechoTurno {
  if (entrada.confirmado)
    return {
      estado: "HANDOFF_CONFIRMADO",
      resposta: TEXTO_HANDOFF_CONFIRMADO,
      origem: "codigo",
      handoffConfirmado: true,
      requerRetomadaHumana: true,
      explicacao: `transferência confirmada pelo serviço (${entrada.motivo})`,
      erro: null,
    };

  return {
    estado: "HANDOFF_FALHOU",
    resposta: TEXTO_HANDOFF_FALHOU,
    origem: "codigo",
    handoffConfirmado: false,
    requerRetomadaHumana: true,
    explicacao: `transferência NÃO confirmada (${entrada.motivo}); resposta reprovada descartada`,
    erro: entrada.erro ?? null,
  };
}

/** Desfecho do turno que esgotou as rodadas do modelo sem resposta aprovada. */
export function desfechoLimiteRodadas(entrada: {
  handoffConfirmado: boolean;
  rodadas: number;
  erro?: string | null;
}): DesfechoTurno {
  if (entrada.handoffConfirmado)
    return {
      estado: "HANDOFF_CONFIRMADO",
      resposta: TEXTO_HANDOFF_CONFIRMADO,
      origem: "codigo",
      handoffConfirmado: true,
      requerRetomadaHumana: true,
      explicacao: `limite de ${entrada.rodadas} rodadas atingido; transferência confirmada`,
      erro: null,
    };
  return {
    estado: "LIMITE_RODADAS",
    resposta: TEXTO_LIMITE_RODADAS,
    origem: "codigo",
    handoffConfirmado: false,
    requerRetomadaHumana: true,
    explicacao: `limite de ${entrada.rodadas} rodadas atingido sem resposta aprovada`,
    erro: entrada.erro ?? null,
  };
}
