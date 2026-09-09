/**
 * FILA DE TRANSPORTE DO ENVIO (Fase 2).
 *
 * A bolha aparece na hora (envio otimista), mas o transporte para o WhatsApp
 * precisa respeitar a ordem em que a atendente digitou. Se três mensagens
 * saem em sequência (A, B, C), o servidor recebe A, depois B, depois C — nunca
 * fora de ordem por causa de uma chamada mais lenta.
 *
 * Cada conversa tem a sua própria fila: uma conversa lenta não segura o envio
 * de outra.
 *
 * Aqui não existe regra de negócio nem validação: quem valida permissão,
 * janela de 24h, responsável e admin continua sendo o servidor.
 */

export type TarefaEnvio = () => Promise<unknown>;

export type FilaEnvio = {
  /** Coloca a tarefa no fim da fila daquela conversa. */
  enfileirar: (conversaId: string, tarefa: TarefaEnvio) => Promise<void>;
  /** Quantas tarefas ainda não terminaram naquela conversa. */
  pendentes: (conversaId: string) => number;
  /** Conversas com transporte em andamento. */
  conversasAtivas: () => string[];
  /** Espera esvaziar (usado em teste). */
  ocioso: (conversaId: string) => Promise<void>;
};

export function criarFilaEnvio(): FilaEnvio {
  const ultima = new Map<string, Promise<void>>();
  const contagem = new Map<string, number>();

  const encerrar = (conversaId: string, minha: Promise<void>) => {
    const n = (contagem.get(conversaId) ?? 1) - 1;
    if (n <= 0) {
      contagem.delete(conversaId);
      if (ultima.get(conversaId) === minha) ultima.delete(conversaId);
    } else {
      contagem.set(conversaId, n);
    }
  };

  return {
    enfileirar(conversaId, tarefa) {
      const anterior = ultima.get(conversaId) ?? Promise.resolve();
      contagem.set(conversaId, (contagem.get(conversaId) ?? 0) + 1);
      // Uma falha não trava a fila: a mensagem seguinte continua saindo.
      // O tratamento do erro (bolha "não enviada") é de quem chamou.
      const minha: Promise<void> = anterior
        .then(() => tarefa())
        .then(
          () => {},
          () => {},
        )
        .then(() => encerrar(conversaId, minha));
      ultima.set(conversaId, minha);
      return minha;
    },
    pendentes(conversaId) {
      return contagem.get(conversaId) ?? 0;
    },
    conversasAtivas() {
      return [...contagem.keys()];
    },
    async ocioso(conversaId) {
      // Espera encadeada: enquanto entram tarefas novas, continua esperando.
      let atual = ultima.get(conversaId);
      while (atual) {
        await atual;
        const proxima = ultima.get(conversaId);
        atual = proxima === atual ? undefined : proxima;
      }
    },
  };
}
