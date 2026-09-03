/**
 * Tabela de preços de UMA especialidade, pronta para imprimir ou exportar.
 *
 * A dentista pediu o catálogo de odontologia em papel, para consultar na
 * bancada durante o atendimento. O preço mostrado aqui tem que ser o mesmo
 * que o caixa vai cobrar, então nada é recalculado: reaproveitamos
 * `calcularParticular` / `calcularConvenio` da Tabela de Valores, que por sua
 * vez repetem a régua do atendimento real. Se a regra de preço mudar num
 * lugar, muda no papel também.
 *
 * O módulo é genérico de propósito — recebe o id da especialidade — porque
 * fisioterapia e as demais têm exatamente a mesma necessidade.
 */

import type { TabelaValoresDados, ConvenioTabelaRef } from "@/lib/agenda/refs-cache";
import {
  calcularConvenio,
  calcularParticular,
  type LinhaValor,
  type ServicoTabela,
} from "./calcular";

export interface LinhaPreco {
  servico: ServicoTabela;
  /** Preço cheio, sem convênio. */
  particular: LinhaValor;
  /** convenioId → preço com aquele convênio. */
  porConvenio: Record<string, LinhaValor>;
}

/**
 * Uma linha por serviço ativo vinculado à especialidade, em ordem alfabética,
 * já com o preço particular e o de cada convênio ativo.
 */
export function linhasDaEspecialidade(
  dados: TabelaValoresDados,
  especialidadeId: string | null,
): LinhaPreco[] {
  if (!especialidadeId) return [];
  const linhas: LinhaPreco[] = [];
  for (const servico of dados.servicos) {
    const especialidadesDoServico = dados.especialidadesPorServico[servico.id] ?? [];
    if (!especialidadesDoServico.includes(especialidadeId)) continue;

    const porConvenio: Record<string, LinhaValor> = {};
    for (const convenio of dados.convenios) {
      porConvenio[convenio.id] = calcularConvenio({
        servico,
        regras: dados.regrasPorConvenio[convenio.id] ?? [],
        especialidadesDoServico,
        valorManual: dados.valoresManuais[`${servico.id}::${convenio.id}`] ?? null,
      });
    }
    linhas.push({ servico, particular: calcularParticular(servico), porConvenio });
  }
  return linhas.sort((a, b) => a.servico.nome.localeCompare(b.servico.nome, "pt-BR"));
}

/**
 * Convênios que valem a pena virar coluna: só os que realmente mudam o preço
 * de pelo menos um serviço da lista.
 *
 * Sem esse corte a folha ganharia colunas inteiras repetindo o particular —
 * foi o que a conferência nos dados de produção mostrou para os campos
 * `valor_cartao_consulta` e `valor_cartao_desconto` do cadastro, que estão
 * zerados nos 180 procedimentos de odontologia e nada informam. O desconto
 * real vem das regras do Cartão Benefícios, e é esse que precisa aparecer.
 */
export function conveniosQueMudamPreco(
  linhas: LinhaPreco[],
  convenios: ConvenioTabelaRef[],
): ConvenioTabelaRef[] {
  return convenios.filter((c) =>
    linhas.some((l) => {
      const v = l.porConvenio[c.id];
      if (!v) return false;
      return v.gratuito || v.dinheiro !== l.particular.dinheiro || v.outros !== l.particular.outros;
    }),
  );
}

/** Uma célula de valor: "Grátis" quando o convênio cobre integralmente. */
export const textoValor = (v: LinhaValor | undefined, forma: "dinheiro" | "outros"): string => {
  if (!v) return "—";
  if (v.gratuito) return "Grátis";
  return Number(v[forma] || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

/** Cabeçalhos da tabela, na ordem em que as colunas são montadas. */
export function cabecalhosDaTabela(convenios: ConvenioTabelaRef[]): string[] {
  return [
    "Procedimento",
    "Particular — Dinheiro",
    "Particular — Cartão/Pix",
    ...convenios.flatMap((c) => [`${c.nome} — Dinheiro`, `${c.nome} — Cartão/Pix`]),
  ];
}

/** Uma linha de texto por serviço, na mesma ordem de `cabecalhosDaTabela`. */
export function linhasDeTexto(linhas: LinhaPreco[], convenios: ConvenioTabelaRef[]): string[][] {
  return linhas.map((l) => [
    l.servico.nome,
    textoValor(l.particular, "dinheiro"),
    textoValor(l.particular, "outros"),
    ...convenios.flatMap((c) => [
      textoValor(l.porConvenio[c.id], "dinheiro"),
      textoValor(l.porConvenio[c.id], "outros"),
    ]),
  ]);
}

/**
 * Mesmas linhas, mas com o valor como NÚMERO — é o que deixa o Excel ordenar
 * por preço e aplicar filtro. Cortesia do convênio vira 0, que é o que o
 * paciente paga.
 */
export function linhasParaPlanilha(
  linhas: LinhaPreco[],
  convenios: ConvenioTabelaRef[],
): Array<Array<string | number | null>> {
  const num = (v: LinhaValor | undefined, forma: "dinheiro" | "outros") =>
    v ? Number(v[forma] || 0) : null;
  return linhas.map((l) => [
    l.servico.nome,
    num(l.particular, "dinheiro"),
    num(l.particular, "outros"),
    ...convenios.flatMap((c) => [
      num(l.porConvenio[c.id], "dinheiro"),
      num(l.porConvenio[c.id], "outros"),
    ]),
  ]);
}
