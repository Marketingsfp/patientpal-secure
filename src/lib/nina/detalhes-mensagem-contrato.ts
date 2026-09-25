/** Leitura da auditoria vinculada à mensagem selecionada. Não altera o atendimento. */
export type LeituraDetalhesMensagem = {
  resultado: string;
  ambiente: "homologacao" | "producao" | "nao_registrado";
  mensagem: {
    id: string;
    texto: string;
    registradaEm: string | null;
    canal: string | null;
    entrega: "registrada" | "enviada" | "confirmada" | "falhou" | "nao_confirmada";
    origem: string;
  } | null;
  entradas: string[];
  respostaOriginal: string | null;
  protocolo: string | null;
  modelo: string | null;
  versaoPrompt: number | string | null;
  /** Só existe quando o próprio turno gravou esta versão. */
  versaoRuntime?: string | null;
  rodadas: number | null;
  duracaoMs: number | null;
  avaliacoes: Array<{
    id: string;
    titulo: string;
    nota: number | null;
    nivel: string | null;
    explicacao: string;
    motivos: string[];
  }>;
  passos: Array<{
    id: string;
    titulo: string;
    descricao: string;
    estado: "concluido" | "falhou" | "em_andamento" | "nao_confirmado" | "ignorado";
    em: string | null;
    duracaoMs: number | null;
  }>;
  alertas: string[];
  /** Rodadas do modelo montadas SÓ com o que o turno gravou; nada é reconstruído. */
  linhaDoTempo?: LinhaDoTempoMensagem;
};

export type EstadoFerramentaRodada =
  | "concluido"
  | "falhou"
  | "ignorado"
  | "nao_confirmado"
  | "nao_registrado";

export type LinhaDoTempoMensagem = {
  rodadas: Array<{
    numero: number;
    modelo: string | null;
    latenciaMs: number | null;
    tokensEntrada: number | null;
    tokensSaida: number | null;
    tentativas: number | null;
    /** Orientações internas do sistema inseridas antes desta rodada. */
    orientacoesAntes: string[];
    /** Texto devolvido pelo modelo nesta rodada, antes de qualquer ajuste. */
    texto: string | null;
    erro: string | null;
    ferramentas: Array<{
      nome: string;
      /** O que o modelo pediu (argumentos originais). */
      argumentos: string | null;
      estado: EstadoFerramentaRodada;
      detalhe: string | null;
      /** O que a ferramenta devolveu, como a Nina recebeu na rodada seguinte. */
      resultado: string | null;
      /** Executada pelo servidor, sem pedido do modelo. */
      pedidaPeloSistema: boolean;
    }>;
    /** Resultados que não puderam ser ligados com segurança a uma ferramenta. */
    resultadosSemVinculo: string[];
    /** Outros registros do sistema entre esta rodada e a próxima. */
    registrosSistema: string[];
  }>;
  /** Registros do sistema antes da primeira chamada ao modelo. */
  antesDoModelo: string[];
  ajusteFinal: { antes: string; depois: string } | null;
  /** Quando o turno respondeu sem chamar o modelo. */
  semModelo: string | null;
};
