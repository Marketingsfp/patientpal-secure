/**
 * Classifica um lançamento financeiro de receita em uma categoria de
 * atendimento, com base na descrição.
 *
 * O que NÃO é atendimento (retorna null)
 * --------------------------------------
 * Mensalidade e adesão do cartão de benefícios, parcela de carnê/contrato
 * importada do sistema anterior e recebimento avulso do caixa. Nada disso é
 * alguém passando por um prestador — entra como receita da clínica, mas
 * inflaria a contagem de atendimentos e derrubaria o ticket médio.
 *
 * A parcela de carnê é o caso mais perigoso: na base de produção são centenas
 * de milhares de linhas no formato "PACIENTE — CONTRATO", com um vencimento
 * por mês (várias no mesmo dia, e muitas com data futura). Uma regra antiga
 * tratava a palavra CONTRATO como consulta particular, herdada de uma planilha
 * legada onde ela estava mesmo rotulada errado; em produção nenhuma dessas
 * linhas está ligada a um agendamento, e tratá-las como consulta multiplicava
 * o número de atendimentos do mês.
 *
 * O formato de um atendimento
 * ---------------------------
 * "PACIENTE — PROCEDIMENTO (ESPECIALIDADE)" e, quando o paciente usou o
 * cartão, mais um trecho de convênio no fim: "— CONVENIO CARTAO CONSULTA +
 * SEGUROS (...)". A categoria sai do PROCEDIMENTO (o trecho entre os travessões),
 * e não da descrição inteira: o nome do convênio também contém a palavra
 * CONSULTA e, lido junto, faria todo exame de quem tem cartão virar consulta.
 * Sem travessão nenhum a linha não tem forma de atendimento (é o caso de
 * "[CAIXA] RECEBIMENTO").
 */
export type AtendCat = "cartao_consulta" | "consulta_particular" | "exame";

/** Uso do cartão de benefícios, no formato atual e no legado importado. */
const MARCAS_CARTAO = [
  "CARTAO CONSULTA",
  "CARTÃO CONSULTA",
  "CONSULTA CARTAO",
  "CONSULTA CARTÃO",
  "EXAME CARTAO",
  "EXAME CARTÃO",
  "CARTAO BENEFICIOS",
  "CARTÃO BENEFÍCIOS",
];

export function classifyAtendimento(descricao: string | null | undefined): AtendCat | null {
  if (!descricao) return null;
  const d = descricao.toUpperCase();

  // Venda do cartão, mensalidade e parcela de carnê: receita, não atendimento.
  if (d.includes("ADESAO") || d.includes("ADESÃO")) return null;
  if (d.includes("MENSALIDADE")) return null;
  if (d.includes("CONTRATO")) return null;

  // Sem o travessão que separa paciente e procedimento não há atendimento
  // descrito (recebimento avulso, reembolso, lançamento manual do caixa).
  if (!descricao.includes("—")) return null;

  const procedimento = d.split("—")[1] ?? "";
  const ehConsulta = procedimento.includes("CONSULTA");

  if (MARCAS_CARTAO.some((m) => d.includes(m))) {
    return ehConsulta ? "cartao_consulta" : "exame";
  }
  return ehConsulta ? "consulta_particular" : "exame";
}

export const CAT_LABELS: Record<AtendCat, string> = {
  cartao_consulta: "Consultas Cartão",
  consulta_particular: "Consultas Particulares",
  exame: "Exames",
};
