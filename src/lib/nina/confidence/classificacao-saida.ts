/**
 * CLASSIFICAÇÃO DA BOLHA (camada pura — sem banco, sem rede).
 *
 * A tela precisa dizer, sem rodeio e sem inventar vínculo, o que cada
 * mensagem da Nina é:
 *
 *  - resposta avaliada: existe nota e ela é do conteúdo que saiu;
 *  - aviso operacional: mensagem controlada do sistema, que o motor não
 *    avaliou — porcentagem não se aplica;
 *  - sem avaliação registrada: nada foi gravado para esta saída;
 *  - texto alterado depois da avaliação: existe nota, mas de outro conteúdo;
 *  - falha ao carregar: a consulta não respondeu (não é "não avaliada").
 *
 * Nada aqui associa mensagem por horário próximo nem por texto parecido.
 */
import type { MotivoVinculo } from "./identidade-saida";

export const CLASSES_SAIDA = [
  "resposta_avaliada",
  "aviso_operacional",
  "sem_avaliacao",
  "texto_alterado",
  "falha_ao_carregar",
] as const;
export type ClasseSaida = (typeof CLASSES_SAIDA)[number];

export const ROTULO_CLASSE_SAIDA: Record<ClasseSaida, string> = {
  resposta_avaliada: "Resposta avaliada",
  aviso_operacional: "Aviso do sistema",
  sem_avaliacao: "Não avaliada",
  texto_alterado: "Texto alterado",
  falha_ao_carregar: "Falha ao carregar",
};

export const EXPLICACAO_CLASSE_SAIDA: Record<ClasseSaida, string> = {
  resposta_avaliada: "A nota foi calculada sobre exatamente este conteúdo.",
  aviso_operacional:
    "Mensagem controlada do sistema (encaminhamento ou bloqueio). Ela não passa pelo motor, então não tem porcentagem.",
  sem_avaliacao: "Não há avaliação registrada para esta mensagem.",
  texto_alterado:
    "O texto entregue é diferente do texto avaliado: a avaliação pertence a outro conteúdo e não vale para esta mensagem.",
  falha_ao_carregar:
    "Não foi possível carregar os dados desta mensagem agora. Isso não significa que ela esteja sem avaliação.",
};

/** Só a resposta avaliada pode exibir porcentagem. */
export function podeExibirPorcentagem(classe: ClasseSaida): boolean {
  return classe === "resposta_avaliada";
}

export type EntradaClassificacao = {
  /** A consulta respondeu? `false` = falha de carregamento. */
  carregou: boolean;
  /** A mensagem é um aviso operacional registrado (protocolo/bloqueio). */
  avisoOperacional: boolean;
  /** Existe alguma avaliação registrada no escopo desta saída. */
  temAvaliacao: boolean;
  /** A avaliação encontrada descreve o conteúdo entregue. */
  avaliacaoAplicavel: boolean;
  /** Motivo canônico do vínculo, quando houver avaliação. */
  motivoVinculo?: MotivoVinculo | null;
};

export type ResultadoClassificacao = {
  classe: ClasseSaida;
  /** Motivo específico — nunca uma frase genérica. */
  explicacao: string;
  /** Limitação declarada de registro antigo/incompleto, quando houver. */
  limitacao: string | null;
};

const LIMITACAO_REGISTRO_ANTIGO =
  "Registro antigo: não há impressão digital do conteúdo, então não dá para conferir se a avaliação é desta mensagem.";
const LIMITACAO_VINCULO_INCOMPLETO =
  "Registro incompleto: faltam vínculos gravados para afirmar que esta avaliação é desta mensagem.";

export function classificarSaida(e: EntradaClassificacao): ResultadoClassificacao {
  if (!e.carregou) {
    return {
      classe: "falha_ao_carregar",
      explicacao: EXPLICACAO_CLASSE_SAIDA.falha_ao_carregar,
      limitacao: null,
    };
  }
  if (e.avisoOperacional) {
    return {
      classe: "aviso_operacional",
      explicacao: EXPLICACAO_CLASSE_SAIDA.aviso_operacional,
      limitacao: null,
    };
  }
  if (!e.temAvaliacao) {
    return {
      classe: "sem_avaliacao",
      explicacao: EXPLICACAO_CLASSE_SAIDA.sem_avaliacao,
      limitacao: null,
    };
  }
  if (e.avaliacaoAplicavel) {
    const limitacao =
      e.motivoVinculo === "registro_antigo_sem_hash" ? LIMITACAO_REGISTRO_ANTIGO : null;
    return {
      classe: "resposta_avaliada",
      explicacao: EXPLICACAO_CLASSE_SAIDA.resposta_avaliada,
      limitacao,
    };
  }
  if (e.motivoVinculo === "conteudo_divergente") {
    return {
      classe: "texto_alterado",
      explicacao: EXPLICACAO_CLASSE_SAIDA.texto_alterado,
      limitacao: null,
    };
  }
  const explicacaoPorMotivo: Partial<Record<MotivoVinculo, string>> = {
    outra_representacao:
      "A avaliação registrada é de outra forma de entrega (texto, áudio ou resumo falado), não desta mensagem.",
    outro_escopo: "A avaliação encontrada pertence a outra conversa ou a outro atendimento.",
    vinculo_incompleto: LIMITACAO_VINCULO_INCOMPLETO,
  };
  return {
    classe: "sem_avaliacao",
    explicacao:
      (e.motivoVinculo ? explicacaoPorMotivo[e.motivoVinculo] : null) ??
      EXPLICACAO_CLASSE_SAIDA.sem_avaliacao,
    limitacao: e.motivoVinculo === "vinculo_incompleto" ? LIMITACAO_VINCULO_INCOMPLETO : null,
  };
}

/** Estado do encaminhamento em linguagem do dia a dia. */
export const ROTULO_ESTADO_AVISO: Record<string, string> = {
  preparado: "Aviso preparado, ainda não enviado",
  envio_pendente: "Envio em andamento",
  confirmado: "Entregue ao paciente",
  falhou: "Falhou",
  incerto: "Resultado desconhecido",
};

/** Estado da entrega registrado na auditoria. */
export const ROTULO_ESTADO_ENTREGA: Record<string, string> = {
  preparada: "Preparada",
  persistida: "Gravada na conversa",
  envio_tentado: "Envio tentado",
  confirmada: "Confirmada pelo transporte",
  falhou: "Falhou",
};
