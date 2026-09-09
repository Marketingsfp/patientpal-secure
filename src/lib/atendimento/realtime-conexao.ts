/**
 * FASE 1 — estado da conexão de tempo real do atendimento.
 *
 * Antes, a primeira confirmação do canal era ignorada: se uma transferência
 * acontecesse na janela entre "a lista já carregou" e "o canal ficou pronto",
 * o aviso nunca chegava e a tela só corrigia com F5.
 *
 * Aqui ficam apenas decisões puras (sem rede e sem tela): dado o status
 * informado pelo canal, qual é o estado da conexão e se é hora de conferir de
 * novo o estado real no servidor.
 *
 * Isto é sincronização, não segurança: toda leitura continua passando pelas
 * funções autenticadas e pelo RLS.
 */

export type EstadoConexao = "CONNECTING" | "SUBSCRIBED" | "DEGRADED" | "DISCONNECTED";

export type AcaoConexao = {
  estado: EstadoConexao;
  /** Conferir novamente lista, contadores, espera e conversa aberta. */
  reconciliar: boolean;
};

export type MaquinaConexao = {
  aplicar: (status: string) => AcaoConexao;
  estado: () => EstadoConexao;
};

export function criarMaquinaConexao(): MaquinaConexao {
  let estado: EstadoConexao = "CONNECTING";

  return {
    estado: () => estado,
    aplicar(status: string): AcaoConexao {
      switch (status) {
        case "SUBSCRIBED": {
          // Confirmação do canal significa: "confira agora o estado real".
          // Só não reconcilia quando já estava confirmado (evento repetido).
          const reconciliar = estado !== "SUBSCRIBED";
          estado = "SUBSCRIBED";
          return { estado, reconciliar };
        }
        case "CHANNEL_ERROR":
        case "TIMED_OUT":
          estado = "DEGRADED";
          return { estado, reconciliar: false };
        case "CLOSED":
          estado = "DISCONNECTED";
          return { estado, reconciliar: false };
        default:
          return { estado, reconciliar: false };
      }
    },
  };
}

/**
 * Nome do canal: depende de clínica e da montagem da tela — nunca da conversa
 * aberta. Trocar de lead não pode derrubar nem recriar a assinatura.
 */
export function chaveCanalAtendimento(clinicaId: string, montagemId: string): string {
  return `atend:${clinicaId}:${montagemId}`;
}
