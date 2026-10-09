import { paraNumero, valorResumo } from "./catalogo";

export type DadosServicoOrigem = {
  nome?: string;
  tipo?: string | null;
  grupo?: string | null;
  preparo?: string | null;
  observacoes?: string | null;
  valor_padrao?: unknown;
  valor_dinheiro?: unknown;
  valor_dinheiro_pix?: unknown;
  valor_pix?: unknown;
  valor_cartao?: unknown;
  valor_cartao_credito?: unknown;
  valor_cartao_debito?: unknown;
  valor_cartao_consulta?: unknown;
  valor_cartao_desconto?: unknown;
  valor_variavel?: boolean;
  exige_preparo?: boolean;
  exige_autorizacao?: boolean;
  exige_termo?: boolean;
  duracao_minutos?: number | null;
  sessoes_incluidas?: number | null;
  ciclo_dias?: number | null;
  requer_laudo?: boolean;
};
const positivo = (v: unknown) => {
  const n = paraNumero(v);
  return n != null && n > 0 ? n : null;
};
const texto = (v: string | null | undefined) => v?.trim() || null;

/** Campos administrativos confirmados, sem inferir preço, preparo ou pedido médico ausente. */
export function dadosDoServico(
  p: DadosServicoOrigem,
  convenios: { nome: string; valor_dinheiro: unknown; valor_outros: unknown }[] = [],
  especialidades: string[] = [],
) {
  const formas_pagamento = p.valor_variavel
    ? []
    : [
        ["Dinheiro", positivo(p.valor_dinheiro) ?? positivo(p.valor_dinheiro_pix)],
        ["Pix", positivo(p.valor_pix)],
        ["Cartão de crédito", positivo(p.valor_cartao_credito)],
        ["Cartão de débito", positivo(p.valor_cartao_debito)],
        [
          "Cartão",
          !positivo(p.valor_cartao_credito) && !positivo(p.valor_cartao_debito)
            ? positivo(p.valor_cartao)
            : null,
        ],
        ["Cartão de consulta", positivo(p.valor_cartao_consulta)],
        ["Cartão de desconto", positivo(p.valor_cartao_desconto)],
      ]
        .filter(([, valor]) => valor != null)
        .map(([forma, valor]) => ({
          forma: String(forma),
          valor: Number(valor),
          condicao: null as string | null,
          observacao: null,
        }));
  if (!p.valor_variavel)
    for (const c of convenios) {
      for (const [forma, valor] of [
        ["Dinheiro", positivo(c.valor_dinheiro)],
        ["Pix / Débito / Crédito", positivo(c.valor_outros)],
      ]) {
        if (valor != null)
          formas_pagamento.push({
            forma: String(forma),
            valor: Number(valor),
            condicao: c.nome,
            observacao: null,
          });
      }
    }
  const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  formas_pagamento.sort(
    (a, b) => comparar(a.condicao ?? "", b.condicao ?? "") || comparar(a.forma, b.forma),
  );
  const valor = p.valor_variavel
    ? null
    : valorResumo({ formas_pagamento, valor: positivo(p.valor_padrao) });
  // Um cadastro pode conter um protocolo inteiro no nome. Usa seu cabeçalho
  // apenas quando há separador explícito; o conteúdo integral permanece na descrição.
  const original = texto(p.nome);
  const cabecalho = original?.split(/[:\n]/, 1)[0]?.replace(/\s+/g, " ").trim();
  const nome =
    original && original.length > 200 && cabecalho && cabecalho.length <= 200
      ? cabecalho
      : original;
  return {
    ...(p.nome !== undefined ? { nome: nome ?? p.nome } : {}),
    valor,
    formas_pagamento,
    valor_observacao: p.valor_variavel
      ? "Valor sob consulta."
      : !formas_pagamento.length && valor != null
        ? "Valor de referência cadastrado; forma de pagamento não informada."
        : null,
    preparo: texto(p.preparo),
    restricoes:
      [
        p.exige_autorizacao ? "Exige autorização." : null,
        p.exige_termo ? "Exige termo." : null,
        p.exige_preparo && !texto(p.preparo)
          ? "Exige preparo; orientações não informadas no cadastro."
          : null,
      ]
        .filter(Boolean)
        .join("\n") || null,
    descricao_publica:
      [
        nome !== original ? original : null,
        texto(p.observacoes),
        especialidades.length
          ? `Especialidades cadastradas: ${[...especialidades].sort(comparar).join(", ")}.`
          : null,
        positivo(p.duracao_minutos)
          ? `Tempo cadastrado no sistema: ${p.duracao_minutos} minutos; não confirma a duração clínica.`
          : null,
        positivo(p.sessoes_incluidas) ? `Sessões incluídas: ${p.sessoes_incluidas}.` : null,
        positivo(p.ciclo_dias) ? `Ciclo cadastrado: ${p.ciclo_dias} dias.` : null,
        p.requer_laudo ? "Laudo previsto no cadastro." : null,
      ]
        .filter(Boolean)
        .join("\n") || null,
    categoria:
      p.tipo === "exame"
        ? ("exame" as const)
        : p.tipo === "procedimento"
          ? ("procedimento" as const)
          : ("exame_procedimento" as const),
  };
}
