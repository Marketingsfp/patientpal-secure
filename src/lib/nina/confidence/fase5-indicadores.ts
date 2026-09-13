/**
 * FASE 5 — Indicadores com denominador auditável.
 *
 * Camada pura. Cada indicador declara numerador, denominador e o nome do
 * denominador. Nada é publicado como porcentagem sem base identificada.
 *
 * REGRAS DURAS:
 *  - "sem erro reportado" nunca vira "resposta correta" nem "transferência
 *    desnecessária";
 *  - caso não revisado fica em "não revisado", fora dos dois lados da conta;
 *  - indeterminado e em processamento são categorias próprias;
 *  - homologação, produção e observação são contadas em separado.
 */
import { porcentagem, type Porcentagem } from "./fase5-explicacao";
import {
  encaminhamentoConclusivo,
  vereditoConclusivo,
  type ItemAmostra,
} from "./fase5-revisao-amostra";

export const VERSAO_INDICADORES = "indicadores-5";

export type ErroPorRegra = {
  regra: string;
  unknown: number;
  falhasTecnicas: number;
  avaliacoes: number;
  proporcao: Porcentagem;
};

export type Indicadores = {
  versao: string;
  ambiente: ItemAmostra["ambiente"] | "todos";
  /** Bloqueios sobre respostas que a revisão humana considerou adequadas. */
  falsosBloqueios: Porcentagem;
  /** Liberações sobre respostas que a revisão humana considerou inadequadas. */
  liberacoesIndevidas: Porcentagem;
  /** LOW final com entrada confirmada na fila, só em produção. */
  lowComFilaConfirmada: Porcentagem;
  falhasDeFila: Porcentagem;
  falhasDeAviso: Porcentagem;
  porRegra: ErroPorRegra[];
  coberturaRevisao: Porcentagem;
  semAvaliacao: number;
  naoRevisados: number;
  indeterminados: number;
  emProcessamento: number;
  observacao: string;
};

export type EntradaIndicadores = {
  itens: ItemAmostra[];
  ambiente?: ItemAmostra["ambiente"];
  /** Contagem de UNKNOWN e falhas técnicas por regra/verificador. */
  regras?: Array<{ regra: string; unknown: number; falhasTecnicas: number; avaliacoes: number }>;
  /** Itens do recorte que sequer têm avaliação registrada. */
  semAvaliacao?: number;
};

export function calcularIndicadores(e: EntradaIndicadores): Indicadores {
  const itens = e.ambiente ? e.itens.filter((i) => i.ambiente === e.ambiente) : e.itens;

  const adequadas = itens.filter((i) => vereditoConclusivo(i.revisao) === "ADEQUADA");
  const inadequadas = itens.filter((i) => vereditoConclusivo(i.revisao) === "INADEQUADA");
  const insuficientes = itens.filter(
    (i) => vereditoConclusivo(i.revisao) === "EVIDENCIA_INSUFICIENTE",
  );
  const naoRevisados = itens.filter((i) => vereditoConclusivo(i.revisao) === "NAO_REVISADA");

  const bloqueadasEntreAdequadas = adequadas.filter((i) => i.destino === "BLOQUEADA").length;
  const liberadasEntreInadequadas = inadequadas.filter((i) => i.destino === "LIBERADA").length;

  const producao = itens.filter((i) => i.ambiente === "producao");
  const lowFinais = producao.filter((i) => i.nivel === "LOW" && i.destino === "BLOQUEADA");
  const lowConfirmados = lowFinais.filter((i) => i.filaConfirmada === true).length;
  const filaFalhou = lowFinais.filter((i) => i.filaConfirmada === false).length;
  const comAviso = lowFinais.filter((i) => i.avisoEnviado !== null);
  const avisoFalhou = comAviso.filter((i) => i.avisoEnviado === false).length;

  const revisados = adequadas.length + inadequadas.length;

  const porRegra: ErroPorRegra[] = (e.regras ?? []).map((r) => ({
    ...r,
    proporcao: porcentagem(r.unknown + r.falhasTecnicas, r.avaliacoes, "avaliações da regra"),
  }));

  return {
    versao: VERSAO_INDICADORES,
    ambiente: e.ambiente ?? "todos",
    falsosBloqueios: porcentagem(
      bloqueadasEntreAdequadas,
      adequadas.length,
      "respostas revisadas como adequadas",
    ),
    liberacoesIndevidas: porcentagem(
      liberadasEntreInadequadas,
      inadequadas.length,
      "respostas revisadas como inadequadas",
    ),
    lowComFilaConfirmada: porcentagem(
      lowConfirmados,
      lowFinais.length,
      "respostas de baixa confiança em produção",
    ),
    falhasDeFila: porcentagem(filaFalhou, lowFinais.length, "operações de fila em produção"),
    falhasDeAviso: porcentagem(avisoFalhou, comAviso.length, "avisos tentados"),
    porRegra,
    coberturaRevisao: porcentagem(revisados, itens.length, "respostas do recorte"),
    semAvaliacao: e.semAvaliacao ?? itens.filter((i) => i.nota == null).length,
    naoRevisados: naoRevisados.length,
    indeterminados:
      insuficientes.length +
      itens.filter((i) => encaminhamentoConclusivo(i.revisao) === "INDETERMINADO").length,
    emProcessamento: itens.filter((i) => i.emProcessamento).length,
    observacao:
      "Casos sem revisão humana não entram como corretos nem como errados. " +
      "Ausência de reporte não é acerto observado.",
  };
}
