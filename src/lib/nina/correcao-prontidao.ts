/**
 * FASE 2 — decide, com a MESMA regra no cliente e no servidor, se "Aplicar
 * correção com Sol" pode ser acionado para a proposta que está na tela.
 *
 * Módulo puro: não lê banco, não chama modelo, não altera nada.
 */
import type { PropostaCorrecao, ResultadoAnalise } from "./analise-erro";

export const ROTULO_BOTAO_APLICAR = "Aplicar correção com Sol";

export type CodigoProntidao =
  | "pronto"
  | "sem_analise"
  | "analise_em_andamento"
  | "analise_falhou"
  | "sem_proposta"
  | "nenhuma_alteracao_necessaria"
  | "informacao_insuficiente"
  | "sem_permissao"
  | "proposta_desatualizada"
  | "executor_indisponivel"
  | "execucao_em_curso";

export type Prontidao = {
  habilitado: boolean;
  codigo: CodigoProntidao;
  motivo: string;
};

const MOTIVOS: Record<CodigoProntidao, string> = {
  pronto: "A proposta acima está pronta para ser aplicada no escopo mostrado.",
  sem_analise: "Nenhuma análise assistida registrada. Use “Analisar com IA”.",
  analise_em_andamento: "A análise ainda está em andamento.",
  analise_falhou: "A análise falhou e não produziu proposta.",
  sem_proposta: "A análise não produziu proposta de mudança.",
  nenhuma_alteracao_necessaria: "Nenhuma alteração necessária.",
  informacao_insuficiente:
    "Falta informação essencial na proposta: sem a mudança escrita não há o que aplicar.",
  sem_permissao: "Você não tem permissão para aplicar correções desta clínica.",
  proposta_desatualizada:
    "A análise foi refeita. Confira a proposta atualizada antes de aplicar.",
  executor_indisponivel: "Executor de correção indisponível neste ambiente.",
  execucao_em_curso: "Já existe uma aplicação em andamento para este erro.",
};

/** Assinatura estável da proposta exibida — muda se a proposta mudar. */
export function assinaturaProposta(proposta: PropostaCorrecao | null): string {
  if (!proposta) return "";
  const base = [
    proposta.camada,
    proposta.alvo,
    proposta.valorAtual ?? "",
    proposta.valorNovo,
    proposta.escopo ?? "",
    proposta.ambiente ?? "",
    proposta.arquivos.join("|"),
    proposta.patch ?? "",
    proposta.revisaoBase ?? "",
  ].join("\u0000");
  // FNV-1a de 64 bits em duas metades: estável entre cliente e servidor.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < base.length; i++) {
    const c = base.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export type EntradaProntidao = {
  /** Status da análise mais recente do erro, quando existir. */
  statusAnalise: "processing" | "done" | "failed" | null;
  resultado: ResultadoAnalise | null;
  proposta: PropostaCorrecao | null;
  temPermissao: boolean;
  executorDisponivel: boolean;
  execucaoEmCurso: boolean;
  /** Assinatura da proposta que o usuário viu ao clicar. */
  assinaturaExibida?: string | null;
};

export function avaliarProntidao(e: EntradaProntidao): Prontidao {
  const nao = (codigo: CodigoProntidao): Prontidao => ({
    habilitado: false,
    codigo,
    motivo: MOTIVOS[codigo],
  });

  if (!e.temPermissao) return nao("sem_permissao");
  if (!e.statusAnalise) return nao("sem_analise");
  if (e.statusAnalise === "processing") return nao("analise_em_andamento");
  if (e.statusAnalise === "failed") return nao("analise_falhou");

  if (!e.proposta) {
    // Sem erro comprovado e sem proposta: o avaliador concluiu que nada muda.
    if (e.resultado && e.resultado.veredito === "sem_erro")
      return nao("nenhuma_alteracao_necessaria");
    return nao("sem_proposta");
  }

  // Camada de código precisa de patch concreto; camada viva precisa do valor novo.
  const semConteudo = !e.proposta.valorNovo.trim();
  const semPatch = !e.proposta.aplicavelAutomaticamente && !e.proposta.patch?.trim();
  if (semConteudo || semPatch) return nao("informacao_insuficiente");

  if (e.execucaoEmCurso) return nao("execucao_em_curso");
  if (!e.executorDisponivel) return nao("executor_indisponivel");

  if (
    e.assinaturaExibida != null &&
    e.assinaturaExibida !== "" &&
    e.assinaturaExibida !== assinaturaProposta(e.proposta)
  )
    return nao("proposta_desatualizada");

  return { habilitado: true, codigo: "pronto", motivo: MOTIVOS.pronto };
}

/* ------------------------------------------------------------------ */
/* Etapas persistidas do progresso                                     */
/* ------------------------------------------------------------------ */

export const ETAPAS_EXECUCAO = [
  "verificando",
  "aplicando",
  "testando",
  "publicando",
  "verificando_resultado",
  "concluido",
] as const;

export type EtapaExecucao = (typeof ETAPAS_EXECUCAO)[number];

export const ROTULO_ETAPA: Record<EtapaExecucao, string> = {
  verificando: "Verificando a proposta",
  aplicando: "Aplicando a mudança",
  testando: "Testando em homologação",
  publicando: "Publicando",
  verificando_resultado: "Verificando o resultado",
  concluido: "Concluído",
};
