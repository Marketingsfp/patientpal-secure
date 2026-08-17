/**
 * Capacidade contratada ("vidas") de um contrato do Cartão Benefícios.
 *
 * O contrato NÃO guarda um campo "quantidade de pessoas do plano". A
 * capacidade é implícita: vem da faixa de preço por vidas do convênio
 * (`cb_convenio_faixas`), casando o `valor_mensal` do contrato com o
 * `valor_mensal` da faixa. Exemplo real:
 *
 *   CARTÃO CONSULTA            1=110  2=155  3=180  4=205  5=230  6=255
 *   CARTÃO CONSULTA + SEGUROS  1=120  2=175  3=210  4=245  5=280  6=295
 *
 * Um contrato de R$ 245,00 no "CARTÃO CONSULTA + SEGUROS" paga a faixa de
 * 4 vidas. Se ele tem 0 dependentes ativos, sobram 3 vagas órfãs — que é
 * o rastro deixado pela migração da planilha de rateios de jun/2026, onde
 * o valor veio junto mas o vínculo titular↔dependente se perdeu.
 *
 * O titular conta como uma vida, EXCETO quando `titular_apenas_financeiro`
 * é true (nesse caso ele só paga, não usa o benefício).
 */

export interface FaixaVidas {
  convenio_id: string;
  vidas_de: number;
  vidas_ate: number | null;
  valor_mensal: number;
}

export interface ContratoParaConferencia {
  id: string;
  convenio_id: string | null;
  valor_mensal: number;
  titular_apenas_financeiro: boolean;
}

export type SituacaoVidas =
  /** Vidas vinculadas batem com a faixa paga. Nada a fazer. */
  | "ok"
  /** Paga por mais gente do que tem vinculada — vagas órfãs. */
  | "faltam_pessoas"
  /** Tem mais gente vinculada do que a faixa paga cobre — cobrança a menor. */
  | "sobram_pessoas"
  /** O valor pago não corresponde a nenhuma faixa do convênio. */
  | "sem_faixa";

export interface DiagnosticoVidas {
  situacao: SituacaoVidas;
  /** Vidas que a faixa paga cobre. `null` quando não há faixa correspondente. */
  vidasEsperadas: number | null;
  /** Titular (se usa o benefício) + dependentes ativos. */
  vidasAtuais: number;
  /** Quantas pessoas faltam vincular. Zero fora de "faltam_pessoas". */
  vagasOrfas: number;
}

/**
 * Índice de faixas para consulta rápida por (convênio, valor exato).
 *
 * A busca é por valor EXATO, não por intervalo. Casar por intervalo
 * ("qual faixa cobre 4 vidas") responderia outra pergunta: aqui queremos
 * o caminho inverso — dado o que o contrato paga, quantas vidas foram
 * contratadas. Valores fora da tabela caem em "sem_faixa" de propósito,
 * porque adivinhar a capacidade de um contrato com desconto antigo (ou
 * valor digitado errado) criaria vaga órfã que não existe.
 */
export function indexarFaixas(faixas: FaixaVidas[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const f of faixas) {
    const chave = chaveFaixa(f.convenio_id, f.valor_mensal);
    const atual = idx.get(chave);
    // Empate de valor entre faixas (ex.: duas faixas com o mesmo preço):
    // fica a de menor número de vidas, que é a hipótese conservadora —
    // gera menos vaga órfã, e vaga órfã a mais vira trabalho manual à toa.
    if (atual === undefined || f.vidas_de < atual) idx.set(chave, f.vidas_de);
  }
  return idx;
}

function chaveFaixa(convenioId: string, valor: number): string {
  // Centavos inteiros: evita o 205.00 !== 205.000000001 do ponto flutuante
  // quando o valor vem como numeric do Postgres via JSON.
  return `${convenioId}|${Math.round(Number(valor) * 100)}`;
}

/**
 * Compara a capacidade paga com as pessoas efetivamente vinculadas.
 *
 * @param contrato          contrato ativo a diagnosticar
 * @param dependentesAtivos nº de dependentes ativos (ativo && !excluido_em)
 * @param faixasIdx         índice devolvido por `indexarFaixas`
 */
export function diagnosticarVidas(
  contrato: ContratoParaConferencia,
  dependentesAtivos: number,
  faixasIdx: Map<string, number>,
): DiagnosticoVidas {
  const vidasAtuais = (contrato.titular_apenas_financeiro ? 0 : 1) + dependentesAtivos;

  const vidasEsperadas = contrato.convenio_id
    ? (faixasIdx.get(chaveFaixa(contrato.convenio_id, contrato.valor_mensal)) ?? null)
    : null;

  if (vidasEsperadas === null) {
    return { situacao: "sem_faixa", vidasEsperadas: null, vidasAtuais, vagasOrfas: 0 };
  }
  if (vidasEsperadas > vidasAtuais) {
    return {
      situacao: "faltam_pessoas",
      vidasEsperadas,
      vidasAtuais,
      vagasOrfas: vidasEsperadas - vidasAtuais,
    };
  }
  if (vidasEsperadas < vidasAtuais) {
    return { situacao: "sobram_pessoas", vidasEsperadas, vidasAtuais, vagasOrfas: 0 };
  }
  return { situacao: "ok", vidasEsperadas, vidasAtuais, vagasOrfas: 0 };
}

/**
 * Valor que o contrato deveria pagar dadas as vidas realmente vinculadas.
 * Aqui sim a busca é por INTERVALO — é a pergunta direta da tabela de preço.
 * Usado só na aba de auditoria, para a gerência ver o tamanho do buraco.
 */
export function valorDevidoPorVidas(
  convenioId: string,
  vidas: number,
  faixas: FaixaVidas[],
): number | null {
  const f = faixas.find(
    (x) =>
      x.convenio_id === convenioId &&
      vidas >= x.vidas_de &&
      (x.vidas_ate === null || vidas <= x.vidas_ate),
  );
  return f ? Number(f.valor_mensal) : null;
}

/**
 * Telefone que não serve como pista de família.
 *
 * Número da própria clínica, sequência repetida (999999999) e campos
 * truncados aparecem em centenas de cadastros. Sugerir "candidato a
 * dependente" a partir deles encheria a fila de falso positivo — e o
 * custo de um falso positivo aqui é vincular a família errada a um plano
 * de saúde, não um item a mais numa lista.
 */
export function telefoneInutilComoPista(telefone: string | null | undefined): boolean {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return true;
  // Todos os dígitos iguais depois do DDD (21999999999, 11888888888…).
  if (/^(\d)\1+$/.test(d.slice(2))) return true;
  // Sequência trivial.
  if (/^0+$/.test(d) || d === "21999999999") return true;
  return false;
}
