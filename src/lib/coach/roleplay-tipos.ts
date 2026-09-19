/** Formatos do treino (roleplay) usados pela tela e pelo servidor. */

/** Cenário sorteado no início do treino. */
export type RoleplayScenario = {
  cenario: string;
  perfil_cliente: string;
  objetivo: string;
  primeira_mensagem: string;
  nome_paciente?: string;
};

/** Avaliação do treinador sobre a última mensagem da atendente. */
export type TurnoAvaliacao = {
  nivel: "bom" | "atencao" | "ruim";
  comentario: string;
  sugestao?: string;
};

/** Feedback final do treino, sempre calculado e gravado pelo servidor. */
export type RoleplayFeedback = {
  nota: number;
  agendou?: boolean;
  aderencia_script?: number;
  resumo: string;
  acertos: string[];
  melhorias: string[];
  dica_pratica: string;
};

/** Resposta de um turno do treino. */
export type RoleplayTurn = {
  finalizar: boolean;
  resposta_cliente?: string;
  feedback?: RoleplayFeedback;
  avaliacao_turno?: TurnoAvaliacao;
};
