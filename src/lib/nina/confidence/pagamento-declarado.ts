import { formasDePagamentoNoTexto, qualificadoresDaAfirmacao, referenciaDoFato } from "./afirmacao";
import {
  normalizarTexto,
  type ChaveFato,
  type ConsultaDoTurno,
  type FatoRecuperado,
} from "./evidencia";

type ResultadoPagamento = {
  situacao: "confirmado" | "divergente" | "sem_fonte" | "nao_verificado";
  motivo: string;
  fato?: FatoRecuperado;
  referencia?: string;
};

function assunto(v: unknown): string {
  return normalizarTexto(v).replace(
    /^(?:consulta|exame|procedimento)\s*(?:de|em)?\s*[—:-]?\s*/u,
    "",
  );
}

function nome(v: unknown): string {
  return normalizarTexto(v).replace(/^(?:dra?|doutora?)\.?\s+/u, "");
}

/** Restrição por serviço é obrigatória: um item não prova a política da clínica inteira. */
export function escopoDaFormaPagamento(chave: ChaveFato, mensagemPaciente: string): ChaveFato {
  const paciente = qualificadoresDaAfirmacao(mensagemPaciente.replace(/[*_]/g, ""));
  const procedimento = assunto(chave.procedimento) ? chave.procedimento : paciente.procedimento;
  return {
    procedimento,
    medicoNome: chave.medicoNome ?? paciente.medicoNome,
    unidadeId: chave.unidadeId ?? paciente.unidadeId,
    convenio: chave.convenio ?? paciente.convenio,
  };
}

/**
 * A negativa segue a regra publicada da clínica: forma não declarada na lista
 * completa do caso consultado não é aceita. Array vazio explícito é válido;
 * campo ausente, truncamento ou falha não são listas completas.
 */
export function verificarFormaPagamento(entrada: {
  forma: string;
  negacao: boolean;
  chave: ChaveFato;
  clinicaId?: string | null;
  fatos: readonly FatoRecuperado[];
  consultas: readonly ConsultaDoTurno[];
}): ResultadoPagamento {
  const pedido = assunto(entrada.chave.procedimento ?? entrada.chave.especialidade);
  if (!pedido)
    return {
      situacao: "nao_verificado",
      motivo:
        "forma de pagamento sem serviço definido — um registro não comprova uma política geral",
    };
  const listas = entrada.fatos.filter((f) => {
    if (
      f.fonte !== "catalogo_publicado" ||
      f.entidade !== "restricao" ||
      !["formas_pagamento_declaradas", "formas_pagamento_indeterminadas"].includes(f.campo)
    )
      return false;
    if (entrada.clinicaId && f.clinicaId !== entrada.clinicaId) return false;
    const chave = f.chave ?? {};
    if (assunto(chave.procedimento ?? chave.especialidade) !== pedido) return false;
    if (entrada.chave.medicoNome && nome(entrada.chave.medicoNome) !== nome(chave.medicoNome))
      return false;
    if (
      entrada.chave.unidadeId &&
      normalizarTexto(entrada.chave.unidadeId) !== normalizarTexto(chave.unidadeId)
    )
      return false;
    if (
      entrada.chave.convenio &&
      normalizarTexto(entrada.chave.convenio) !== normalizarTexto(chave.convenio)
    )
      return false;
    return true;
  });
  if (!listas.length)
    return {
      situacao: "sem_fonte",
      motivo: "não há lista declarada de formas de pagamento para este serviço/profissional",
    };
  if (listas.some((f) => f.campo === "formas_pagamento_indeterminadas")) {
    return {
      situacao: "nao_verificado",
      motivo:
        "há registro do mesmo serviço/profissional sem lista completa de pagamento — não é possível generalizar o aceite ou a negativa",
    };
  }

  const comparacoes: Array<{ aceita: boolean; fato: FatoRecuperado }> = [];
  for (const fato of listas) {
    const consulta = entrada.consultas.find(
      (c) => c.id === fato.consulta && c.capacidade === fato.capacidade,
    );
    if (!consulta || consulta.status !== "com_itens" || consulta.truncado) {
      return {
        situacao: "nao_verificado",
        motivo:
          "a lista não tem consulta completa e bem-sucedida vinculada — falha ou corte não comprova aceitação nem ausência",
      };
    }
    let formas: unknown;
    try {
      formas = JSON.parse(fato.valor ?? "");
    } catch {
      formas = null;
    }
    if (!Array.isArray(formas) || formas.some((f) => typeof f !== "string" || !f.trim())) {
      return {
        situacao: "nao_verificado",
        motivo: "lista de formas de pagamento ausente ou inválida",
      };
    }
    const aceita = formas.some((f: string) => {
      const conhecidas = formasDePagamentoNoTexto(f);
      return conhecidas.length
        ? conhecidas.includes(entrada.forma)
        : normalizarTexto(f) === entrada.forma;
    });
    comparacoes.push({ aceita, fato });
  }
  if (comparacoes.some((c) => c.aceita !== comparacoes[0]!.aceita)) {
    return {
      situacao: "nao_verificado",
      motivo:
        "as listas publicadas discordam para o caso informado — esclarecer o profissional ou a condição",
    };
  }
  const { aceita, fato } = comparacoes[0]!;
  return {
    situacao: aceita !== entrada.negacao ? "confirmado" : "divergente",
    fato,
    referencia: referenciaDoFato(fato),
    motivo: aceita
      ? "a forma está declarada na lista completa do serviço/profissional consultado"
      : "a forma não está declarada na lista completa do serviço/profissional e, pela regra da clínica, não é aceita",
  };
}
