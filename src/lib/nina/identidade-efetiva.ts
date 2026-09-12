/**
 * FASE 2 — UMA FONTE EFETIVA POR TURNO (identidade de apresentação).
 *
 * A identidade usada nas mensagens vem SEMPRE do mesmo texto versionado que
 * gerou as instruções do turno (o snapshot fixado em
 * `instrucoes-runtime.server`). Nunca de `clinicas.nome`, de nome curto
 * derivado do cadastro, de literal do código ou de inferência sobre o tipo do
 * estabelecimento.
 *
 * Política explícita:
 *  - origem `publicada` ou `cache` (última versão válida completa do MESMO
 *    escopo): identidade lida do bloco daquele texto. Instruções e identidade
 *    vêm sempre da MESMA versão — nunca se misturam.
 *  - origem `codigo` (prompt de reserva): não existe identidade publicada;
 *    o atendimento fala de forma NEUTRA e a pendência administrativa é
 *    registrada. Não volta silenciosamente para "Nina"/"Menino Jesus".
 *  - bloco ausente/duplicado/inválido na versão do turno: mesma resposta
 *    neutra, com o motivo legível para o administrador.
 *
 * Identidade de APRESENTAÇÃO ≠ dados administrativos da clínica (nome
 * oficial, endereço, telefone, e-mail), que continuam vindo do cadastro da
 * clínica correta e viajam separadamente no contexto.
 *
 * Módulo puro: sem banco, sem rede, sem estado.
 */
import { extrairIdentidade, type IdentidadeAtendimento } from "./identidade-atendimento";

export type OrigemIdentidade = "publicada" | "cache" | "indisponivel";

export type MotivoIdentidadeEfetiva =
  | "OK"
  | "PROMPT_DE_RESERVA"
  | "BLOCO_INVALIDO";

/** Textos neutros: sem marca, sem persona inventada. */
export const IDENTIDADE_NEUTRA = {
  assistente: "a assistente virtual do atendimento",
  estabelecimento: "esta unidade",
  tipoEstabelecimento: "unidade de saúde",
} as const;

export type IdentidadeEfetiva = {
  /** true só quando a versão do turno traz um bloco de identidade válido. */
  ok: boolean;
  /** Identidade publicada; null quando não há identidade válida. */
  identidade: IdentidadeAtendimento | null;
  origem: OrigemIdentidade;
  motivo: MotivoIdentidadeEfetiva;
  /** Explicação legível (usada em auditoria e na pendência administrativa). */
  detalhe: string | null;
  /** Versão publicada de onde a identidade (ou a sua ausência) veio. */
  versao: number | null;
  versaoId: string | null;
  /** Mensagem para o administrador corrigir na aba Arquitetura. */
  pendenciaAdministrativa: string | null;
  /** Nomes efetivamente usados nas mensagens (neutros quando não há bloco). */
  apresentacao: {
    assistente: string;
    estabelecimento: string;
    tipoEstabelecimento: string;
  };
};

export type SnapshotParaIdentidade = {
  /** Conteúdo publicado ANTES da substituição de dados. */
  template: string;
  origem: "publicada" | "cache" | "codigo";
  versao: number | null;
  versaoId: string | null;
};

function neutra(
  snapshot: SnapshotParaIdentidade,
  motivo: MotivoIdentidadeEfetiva,
  detalhe: string,
): IdentidadeEfetiva {
  return {
    ok: false,
    identidade: null,
    origem: "indisponivel",
    motivo,
    detalhe,
    versao: snapshot.versao,
    versaoId: snapshot.versaoId,
    pendenciaAdministrativa:
      "Identidade do atendimento indisponível: " +
      detalhe +
      " Enquanto isso a assistente responde sem citar nome próprio nem nome do estabelecimento. " +
      "Corrija o bloco [IDENTIDADE DO ATENDIMENTO] em Arquitetura e publique.",
    apresentacao: { ...IDENTIDADE_NEUTRA },
  };
}

/**
 * Resolve a identidade EFETIVA do turno a partir do mesmo snapshot que gerou
 * as instruções. Não recebe (e não aceita) dados do cadastro da clínica.
 */
export function resolverIdentidadeEfetiva(
  snapshot: SnapshotParaIdentidade,
): IdentidadeEfetiva {
  if (snapshot.origem === "codigo") {
    return neutra(
      snapshot,
      "PROMPT_DE_RESERVA",
      "o atendimento está usando o prompt de reserva do código, que não tem identidade publicada.",
    );
  }

  const leitura = extrairIdentidade(snapshot.template);
  if (!leitura.ok) {
    return neutra(snapshot, "BLOCO_INVALIDO", leitura.mensagem);
  }

  return {
    ok: true,
    identidade: leitura.identidade,
    origem: snapshot.origem,
    motivo: "OK",
    detalhe: null,
    versao: snapshot.versao,
    versaoId: snapshot.versaoId,
    pendenciaAdministrativa: null,
    apresentacao: {
      assistente: leitura.identidade.assistente,
      estabelecimento: leitura.identidade.estabelecimento,
      tipoEstabelecimento: leitura.identidade.tipoEstabelecimento,
    },
  };
}

/**
 * Marcadores de DADOS substituídos no texto do escopo `whatsapp`.
 * `${nomeUnidade}`/`${nomeCurtoUnidade}` são de APRESENTAÇÃO: recebem o nome
 * publicado (ou o neutro), nunca `clinicas.nome`.
 */
export function valoresIdentidade(
  efetiva: IdentidadeEfetiva,
): Record<string, string> {
  const a = efetiva.apresentacao;
  const completo = efetiva.ok
    ? `${a.tipoEstabelecimento} ${a.estabelecimento}`.trim()
    : a.estabelecimento;
  return {
    "${nomeAssistente}": a.assistente,
    "${nomeEstabelecimento}": a.estabelecimento,
    "${tipoEstabelecimento}": a.tipoEstabelecimento,
    "${nomeUnidade}": completo,
    "${nomeCurtoUnidade}": a.estabelecimento,
  };
}

/** Bloco de fatos da identidade para o contexto do turno (auditável). */
export function fatosIdentidade(efetiva: IdentidadeEfetiva) {
  return {
    assistente: efetiva.apresentacao.assistente,
    estabelecimento: efetiva.apresentacao.estabelecimento,
    tipo_estabelecimento: efetiva.apresentacao.tipoEstabelecimento,
    identidade_publicada: efetiva.ok,
    origem: efetiva.origem,
    motivo: efetiva.motivo,
    versao: efetiva.versao,
    versao_id: efetiva.versaoId,
    pendencia_administrativa: efetiva.pendenciaAdministrativa,
  };
}
