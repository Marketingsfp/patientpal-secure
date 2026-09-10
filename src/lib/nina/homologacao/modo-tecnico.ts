/**
 * FASE 4 — MODO TÉCNICO DE HOMOLOGAÇÃO.
 *
 * Regras inegociáveis deste módulo:
 *   1. Quem decide é o SERVIDOR. O conteúdo enviado pelo paciente nunca entra
 *      nesta decisão — não existe parâmetro de texto aqui de propósito.
 *   2. Só vale em homologação/teste automatizado, no canal de teste.
 *   3. Nenhuma ação real: o modo técnico não libera agendar, cancelar,
 *      transferir de verdade nem enviar WhatsApp.
 *
 * Módulo PURO: sem banco, sem rede.
 */
import {
  REGRA_SAUDACAO,
  type RestricaoEstruturada,
} from "../prompt/precedencia";
import type { AmbienteQA } from "../confianca-execucao";

/** Canal exclusivo da homologação. WhatsApp real nunca é aceito aqui. */
export const CANAL_HOMOLOGACAO = "test-console";

export type PedidoModoTecnico = {
  /** Ambiente calculado pelo servidor (nunca vem do navegador). */
  ambiente: AmbienteQA;
  /** Canal físico da conversa. */
  canal: string;
  /** O servidor autorizou esta verificação para este usuário/clínica. */
  autorizadoPeloServidor: boolean;
};

export type DecisaoModoTecnico = {
  ativo: boolean;
  motivo: string;
};

/**
 * Decide se o modo técnico pode valer neste turno. Note que não existe
 * argumento com o texto do paciente: escrever "homologação" no WhatsApp de
 * produção não tem como ativar nada.
 */
export function decidirModoTecnico(p: PedidoModoTecnico): DecisaoModoTecnico {
  if (p.ambiente === "producao") {
    return { ativo: false, motivo: "ambiente de produção" };
  }
  if (p.canal !== CANAL_HOMOLOGACAO) {
    return { ativo: false, motivo: `canal ${p.canal} não é de homologação` };
  }
  if (!p.autorizadoPeloServidor) {
    return { ativo: false, motivo: "verificação não autorizada pelo servidor" };
  }
  return { ativo: true, motivo: "verificação de homologação autorizada" };
}

/**
 * Exceções publicadas que a verificação de FONTE aplica ao turno.
 * A apresentação obrigatória é suprimida porque a verificação exige que a
 * primeira resposta seja exatamente o marcador — e apenas nesse turno.
 */
export function excecoesDaVerificacaoDeFonte(regraPublicada: string): RestricaoEstruturada[] {
  return [
    {
      codigo: "VERIFICACAO_FONTE_MARCADOR",
      nivel: "excecao_publicada",
      origem: "instrucoes publicadas (escopo homologacao)",
      descricao: "turno de verificação de fonte: resposta é o marcador publicado",
      suprime: [REGRA_SAUDACAO],
      texto: regraPublicada,
    },
    {
      codigo: "SEM_ACAO_REAL_EM_HOMOLOGACAO",
      nivel: "inegociavel",
      origem: "homologação",
      descricao: "nenhuma ação real é executada nesta verificação",
      texto: "Nenhuma ferramenta é declarada nesta requisição; nenhuma operação pode ser executada.",
    },
  ];
}
