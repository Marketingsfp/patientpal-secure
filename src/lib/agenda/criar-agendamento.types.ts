// Tipos compartilhados da criação/edição de agendamento.
//
// Ficam num arquivo separado (client-safe) porque a UI importa esses tipos e
// o núcleo da regra vive em `criar-agendamento.core.server.ts`, que o
// navegador não pode importar. Nenhum comportamento aqui — só tipos.

export type CriarAgendamentoInput = {
  clinica_id: string;
  // Presença = UPDATE do agendamento com esse id; ausência = INSERT.
  editing_id: string | null;
  // Payload final já montado pelo caller (equivale ao `payload` do submit clássico).
  payload: {
    clinica_id: string;
    paciente_nome: string;
    paciente_id: string | null;
    medico_id: string | null;
    inicio: string;
    fim: string;
    procedimento: string | null;
    status: "agendado" | "cancelado" | "confirmado" | "faltou" | "realizado";
    observacoes: string | null;
    data_pagamento: string | null;
    orcamento_id: string | null;
    tipo_atendimento: "particular" | "convenio";
    forma_pagamento_prevista: string | null;
    especialidade_id?: string | null;
  };
  procedimentos?: string[];
  multi_exames_modo?: "laboratorio" | "imagem" | null;
  // Checagens que consultam o banco.
  checagens: {
    validar_paciente_completo: boolean; // sempre true na clássica
    // Mantido por compatibilidade — NÃO é mais usado para decidir se a
    // checagem de agenda/slot roda (CRIT-04). O servidor decide sozinho;
    // ver criarAgendamentoCore.
    validar_agenda_aberta: boolean;
    validar_inadimplencia: boolean; // paciente_id && tipo_atendimento === "convenio"
  };
  pending_orc_item_ids: string[];
  // Confirmações que a recepção já deu na tela. Hoje só existe uma:
  // o paciente ter outro atendimento no mesmo horário com OUTRO profissional
  // (ver MED-03 em criar-agendamento.core.server.ts). Sem isso o servidor
  // devolve `validation_error.confirmavel` e a tela pergunta antes de repetir
  // a gravação com o flag ligado.
  confirmacoes?: { permitir_conflito_paciente?: boolean };
};

export type PgErrorLike = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

// Resultado estruturado — preserva fielmente `toast.error(msg, { duration })`
// e o `mostrarErro(vErr, "...")` do submit clássico (que a UI já sabe tratar).
export type CriarAgendamentoResult =
  | {
      ok: true;
      id: string;
      /**
       * IDs de agendamentos-irmãos criados junto com o principal (modo imagem
       * multi-exame). Vazio no caso comum (1 exame ou modo laboratório).
       * O caller precisa desses IDs para registrar pagamento único cobrindo
       * todos os exames do mesmo horário/paciente.
       */
      sibling_ids?: string[];
      /**
       * Diagnóstico de performance (milissegundos gastos DENTRO do servidor).
       * Serve para separar o que é tempo de banco do que é tempo de rede
       * entre o navegador e o Worker. Não influencia nenhuma regra.
       */
      tempos?: { leituras: number; gravacao: number; total: number };
      // Vínculo de itens de orçamento falhou, mas o agendamento foi salvo.
      vinculo_warning?: { pg_error: PgErrorLike };
    }
  | {
      ok: false;
      // Erro de validação com mensagem PT-BR pronta para toast.
      // `confirmavel` marca o caso em que a regra é só um aviso: a tela pode
      // perguntar "deseja agendar mesmo assim?" e reenviar com a confirmação
      // correspondente em `confirmacoes`.
      validation_error: {
        message: string;
        toast_duration?: number;
        confirmavel?: "conflito_paciente";
      };
    }
  | {
      ok: false;
      // Erro do Postgres/Supabase — a UI passa para `mostrarErro`.
      pg_error: PgErrorLike;
    };
