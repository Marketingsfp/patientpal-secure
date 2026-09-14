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
};
