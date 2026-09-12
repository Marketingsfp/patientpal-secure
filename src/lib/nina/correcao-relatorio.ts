/**
 * FASE 5 — Relatório "Resultado da correção".
 *
 * Regra central: o relatório NASCE DOS FATOS DO EXECUTOR (o que foi gravado,
 * publicado, testado e reconferido), nunca da afirmação do avaliador de que
 * corrigiu. Proposta, patch preparado, teste aprovado e publicação concluída
 * são eventos distintos e aparecem separados.
 *
 * Módulo puro: não lê banco, não chama modelo, não altera nada.
 */
import type { PropostaCorrecao } from "./analise-erro";
import type { PassoExecucao, ResultadoTeste, ResumoExecucao } from "./correcao-executor";
import type { ResultadoFinalExecucao } from "./correcao-limites";

export type ResultadoRelatorio =
  | "corrigido_verificado"
  | "aplicado_aguardando_publicacao"
  | "falhou"
  | "nenhuma_mudanca_necessaria"
  | "pendente_integracao";

export const ROTULO_RESULTADO_RELATORIO: Record<ResultadoRelatorio, string> = {
  corrigido_verificado: "Corrigido e verificado",
  aplicado_aguardando_publicacao: "Aplicado, aguardando publicação",
  falhou: "Falhou",
  nenhuma_mudanca_necessaria: "Nenhuma mudança necessária",
  pendente_integracao: "Pendente de integração/informação",
};

export type AlteracaoRelatorio = {
  /** O que foi mexido: item do catálogo, prompt publicado, arquivo de código… */
  tipo: "catalogo" | "prompt" | "codigo" | "configuracao";
  alvo: string;
  antes: string | null;
  depois: string | null;
  /** Diff detalhado (patch) quando a mudança vive em código. */
  diff: string | null;
  /** Efetivada de verdade, ou apenas registrada para quem publica. */
  efetivada: boolean;
};

export type RelatorioCorrecao = {
  resultado: ResultadoRelatorio;
  explicacao: { problema: string; mudanca: string; comportamentoEsperado: string };
  alteracoes: AlteracaoRelatorio[];
  evidencias: {
    analiseId: string | null;
    pacoteHash: string | null;
    pacoteRevisao: number | null;
    origem: string | null;
    ambiente: string | null;
    entradas: number;
    lacunas: { rotulo: string; motivo: string }[];
    cortes: string[];
  };
  testes: {
    executado: boolean;
    aprovado: boolean;
    ambiente: string;
    pergunta: string | null;
    resposta: string | null;
    motivo: string;
    naoRealizadas: string[];
  };
  trabalho: {
    execucaoId: string | null;
    solicitadoPor: string | null;
    modelo: string;
    provedor: string;
    inicio: string | null;
    fim: string | null;
    duracaoMs: number | null;
    idempotenciaChave: string | null;
    tentativa: number | null;
  };
  versao: {
    anterior: string | null;
    nova: string | null;
    publicado: boolean;
    publicacaoConfirmada: boolean;
    revisaoAtual: string | null;
  };
  reversao: { possivel: boolean; tipo: "catalogo" | "prompt" | "codigo" | "nenhum"; instrucao: string };
  passos: PassoExecucao[];
};

export type EntradaRelatorio = {
  proposta: PropostaCorrecao;
  status: ResumoExecucao["status"];
  resultadoFinal: ResultadoFinalExecucao;
  aplicavel: boolean;
  publicado: boolean;
  valorAnterior: string | null;
  motivo: string;
  passos: PassoExecucao[];
  teste: ResultadoTeste;
  verificacao: {
    conferido: boolean;
    alvo: string;
    esperado?: string;
    efetivo?: string | null;
    revisao?: string | null;
    motivo: string;
  } | null;
  codigo: {
    disponivel: boolean;
    aplicado: boolean;
    publicado: boolean;
    revisaoBase: string | null;
    revisaoNova: string | null;
    testes: string | null;
    motivo: string;
    dependencia: string | null;
  } | null;
  evidencias: {
    analiseId: string | null;
    pacoteHash: string | null;
    pacoteRevisao: number | null;
    origem: string | null;
    ambiente: string | null;
    entradas: number;
    lacunas: { rotulo: string; motivo: string }[];
    cortes: string[];
  };
  trabalho: {
    execucaoId: string | null;
    solicitadoPor: string | null;
    modelo: string;
    provedor: string;
    inicio: string;
    fim: string;
    idempotenciaChave: string | null;
    tentativa: number | null;
  };
  /** Versão publicada da Arquitetura, quando houve publicação. */
  versaoPrompt?: { anterior: string | null; nova: string | null } | null;
};

function duracao(inicio: string, fim: string): number | null {
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
}

/** Reúne o que de fato foi alterado, com antes/depois real de cada item. */
function montarAlteracoes(e: EntradaRelatorio): AlteracaoRelatorio[] {
  const itens: AlteracaoRelatorio[] = [];

  if (e.aplicavel && e.publicado) {
    itens.push({
      tipo: e.proposta.camada === "catalogo" ? "catalogo" : "prompt",
      alvo: e.proposta.alvo,
      antes: e.valorAnterior,
      depois: e.proposta.valorNovo,
      diff: null,
      efetivada: true,
    });
  }

  if (!e.aplicavel) {
    const efetivada = Boolean(e.codigo?.aplicado);
    const arquivos = e.proposta.arquivos.length ? e.proposta.arquivos : [e.proposta.alvo];
    for (const arquivo of arquivos) {
      itens.push({
        tipo: "codigo",
        alvo: arquivo,
        antes: e.proposta.valorAtual,
        depois: e.proposta.valorNovo,
        diff: e.proposta.patch,
        efetivada,
      });
    }
  }

  return itens;
}

/** Verificações que ficaram de fora — dito explicitamente, sem sugerir cobertura. */
function naoRealizadas(e: EntradaRelatorio): string[] {
  const faltas: string[] = [];
  if (!e.teste.executado) faltas.push("Teste em homologação não foi executado.");
  if (!e.verificacao) faltas.push("Valor efetivo não foi relido depois da gravação.");
  if (!e.aplicavel && !e.codigo?.aplicado)
    faltas.push("Alteração de código não foi aplicada, testada nem publicada neste ambiente.");
  if (!e.aplicavel && !e.codigo?.testes)
    faltas.push("Testes automatizados do repositório não foram executados por este fluxo.");
  faltas.push("Nenhuma verificação foi feita com paciente real ou envio real de mensagem.");
  return faltas;
}

function resultadoDe(e: EntradaRelatorio, alteracoes: AlteracaoRelatorio[]): ResultadoRelatorio {
  if (!e.aplicavel && e.codigo && !e.codigo.disponivel) return "pendente_integracao";
  if (e.status === "falhou" || e.resultadoFinal === "falhou") return "falhou";
  if (e.resultadoFinal === "verificado") return "corrigido_verificado";
  if (e.resultadoFinal === "aplicado" || e.resultadoFinal === "aguardando_publicacao")
    return "aplicado_aguardando_publicacao";
  if (!alteracoes.some((a) => a.efetivada)) return "nenhuma_mudanca_necessaria";
  return "aplicado_aguardando_publicacao";
}

function explicar(e: EntradaRelatorio, resultado: ResultadoRelatorio): RelatorioCorrecao["explicacao"] {
  const problema = e.proposta.justificativa.trim() || e.motivo;
  const mudanca =
    resultado === "pendente_integracao"
      ? `A mudança está escrita e registrada em ${e.proposta.alvo}, mas depende de publicação de código.`
      : `${e.proposta.alvo}: passou a valer "${e.proposta.valorNovo}".`;
  const esperado =
    resultado === "corrigido_verificado"
      ? "Nas próximas conversas, a resposta passa a usar a informação corrigida."
      : resultado === "aplicado_aguardando_publicacao"
        ? "A mudança está gravada; o novo comportamento vale a partir da publicação."
        : resultado === "falhou"
          ? "Nada mudou no atendimento: o comportamento anterior continua valendo."
          : resultado === "nenhuma_mudanca_necessaria"
            ? "Nada foi alterado porque nenhuma mudança se mostrou necessária."
            : "O comportamento só muda depois que alguém com acesso ao código publicar a alteração.";
  return { problema, mudanca, comportamentoEsperado: esperado };
}

function montarReversao(e: EntradaRelatorio): RelatorioCorrecao["reversao"] {
  if (!e.aplicavel) {
    return e.codigo?.aplicado && e.codigo.revisaoBase
      ? {
          possivel: true,
          tipo: "codigo",
          instrucao: `Reverter para a revisão ${e.codigo.revisaoBase} pelo mesmo serviço que aplicou.`,
        }
      : {
          possivel: false,
          tipo: "nenhum",
          instrucao: "Nada foi alterado no código: não há o que reverter.",
        };
  }
  if (!e.publicado)
    return { possivel: false, tipo: "nenhum", instrucao: "Nenhuma alteração foi gravada." };
  if (e.proposta.camada === "catalogo")
    return {
      possivel: e.valorAnterior != null,
      tipo: "catalogo",
      instrucao:
        e.valorAnterior != null
          ? `Restaurar "${e.valorAnterior}" no item ${e.proposta.alvo} pelo próprio catálogo.`
          : "Valor anterior não registrado: a reversão precisa ser feita manualmente no catálogo.",
    };
  return {
    possivel: true,
    tipo: "prompt",
    instrucao:
      "Reverter publicando de novo a versão anterior da Arquitetura pelo histórico de versões.",
  };
}

export function montarRelatorio(e: EntradaRelatorio): RelatorioCorrecao {
  const alteracoes = montarAlteracoes(e);
  const resultado = resultadoDe(e, alteracoes);

  return {
    resultado,
    explicacao: explicar(e, resultado),
    alteracoes,
    evidencias: e.evidencias,
    testes: {
      executado: e.teste.executado,
      aprovado: e.teste.aprovado,
      ambiente: "Homologação (leads sintéticos) — nenhum envio real.",
      pergunta: e.teste.pergunta,
      resposta: e.teste.resposta,
      motivo: e.teste.motivo,
      naoRealizadas: naoRealizadas(e),
    },
    trabalho: {
      ...e.trabalho,
      duracaoMs: duracao(e.trabalho.inicio, e.trabalho.fim),
    },
    versao: {
      anterior: e.versaoPrompt?.anterior ?? e.codigo?.revisaoBase ?? e.proposta.revisaoBase ?? null,
      nova: e.versaoPrompt?.nova ?? e.codigo?.revisaoNova ?? null,
      publicado: e.publicado || Boolean(e.codigo?.publicado),
      publicacaoConfirmada: Boolean(e.verificacao?.conferido) || Boolean(e.codigo?.publicado),
      revisaoAtual: e.verificacao?.revisao ?? e.codigo?.revisaoNova ?? null,
    },
    reversao: montarReversao(e),
    passos: e.passos,
  };
}
