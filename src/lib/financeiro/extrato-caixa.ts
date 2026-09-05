/**
 * Relatório "Movimentação Financeira" — as duas visões que o financeiro usava
 * no sistema anterior para conciliar banco e fechar o caixa geral.
 *
 * Não confundir com o Rateio da Receita, que vive ao lado dele na mesma tela:
 * o Rateio olha o ATENDIMENTO (quanto ficou para a clínica, quanto foi para o
 * médico) e ignora de propósito mensalidade de cartão, adesão e recebimento
 * avulso, porque nada disso tem prestador a repassar. Este olha o CAIXA
 * GERAL — tudo que entrou e tudo que saiu, paciente e fornecedor na mesma
 * lista, sem exceção.
 *
 * Duas visões, montadas sobre exatamente as mesmas linhas:
 *
 * 1. **Analítica** — uma linha por movimentação, com o valor separado em
 *    Valor Pago e Valor Recebido em vez de uma coluna de valor + coluna de
 *    tipo. É esse desenho que permite somar a coluna direto contra o extrato
 *    do banco.
 * 2. **Sintética** — o mesmo dinheiro agrupado por Categoria, com o total de
 *    entradas e de saídas de cada uma.
 *
 * As duas somam ao MESMO total de propósito: é essa igualdade que a
 * conferência usa para saber que nada ficou de fora.
 *
 * As linhas saem no formato que a tela de Relatórios espera — um objeto por
 * linha, lido pela `chave` de cada coluna —, para que tabela, folha A4, Excel
 * e CSV sejam alimentados pela mesma lista, sem um caminho paralelo por
 * formato. O carregamento dos dados fica em `./extrato-carregar`; aqui não há
 * nenhum acesso a banco, e por isso as duas visões podem ser testadas
 * inteiras sem subir o Supabase.
 */
import type { ColunaRateio } from "./rateio-colunas";
import { LABEL_FORMA, type FormaCanonica, type ParteMisto } from "./formas-pagamento";
import { receitaPorForma, type FatiaDaReceita } from "./receita-por-forma";
import { SEM_CATEGORIA } from "./filtro-categoria";

/**
 * Rótulo usado quando a linha não tem categoria e nem dá para deduzi-la.
 *
 * Mora em `./filtro-categoria` porque o seletor de Categoria da tela de
 * Relatórios precisa oferecer exatamente esse mesmo rótulo como opção; é
 * reexportado aqui para quem já lia daqui continuar lendo.
 */
export { SEM_CATEGORIA };

/** Categoria das sangrias e suprimentos, que não passam por `fin_categorias`. */
export const CATEGORIA_TRANSFERENCIA = "TRANSFERENCIA ENTRE CAIXAS";

/** Qual das duas visões está sendo montada. */
export type VisaoExtrato = "sintetico" | "analitico";

/**
 * Uma movimentação, no mínimo que o relatório precisa saber.
 *
 * Os nomes (categoria, conta, paciente, médico, usuário) chegam já resolvidos:
 * quem faz isso é `carregarMovimentacao`, uma vez por período, em vez de uma
 * consulta por linha.
 */
export type MovimentacaoExtrato = {
  /** Competência, em ISO (`2026-09-02`). É a data que o relatório mostra. */
  data: string;
  /** HH:MM, quando conhecida. Ordena e vai numa coluna própria. */
  hora?: string | null;
  tipo: "receita" | "despesa" | "transferencia";
  /** Só para `transferencia`: suprimento entra, sangria sai. */
  transferSentido?: "entrada" | "saida" | null;
  descricao: string;
  valor: number;
  /** Nome da categoria já resolvido; `null` quando o lançamento não tem uma. */
  categoriaNome?: string | null;
  /** Nome da conta (`fin_contas.nome`). */
  contaNome?: string | null;
  /** Banco da conta (`fin_contas.banco`), quando cadastrado. */
  contaBanco?: string | null;
  /** Forma de pagamento em rótulo de gente ("Dinheiro", "PIX", "Cartão de Débito"). */
  formaPagamento?: string | null;
  /** A mesma forma no balde canônico, para a quebra por forma sair na ordem e
   *  nas cores que o Fechamento de Caixa e o Rateio já usam. */
  formaCanonica?: FormaCanonica | null;
  /**
   * Pagamento misto já ABERTO nas formas reais.
   *
   * Preenchido só quando o lançamento tem como abrir — pela composição gravada
   * pela tela de lançamento ou, nos antigos, pelo texto da observação. Quem
   * monta é `carregarMovimentacao`, com a mesma `repartirPorForma` que o Rateio
   * e o Fechamento de Caixa usam, e por isso as partes somam exatamente
   * `valor` — nenhum centavo se perde ao decompor.
   *
   * O misto que NÃO abre continua chegando aqui sem partes, e é só ele que o
   * relatório mostra como "Misto (não decomposto)": era essa linha que juntava
   * também os mistos abríveis e escondia da conferência da maquininha a parte
   * paga em cartão.
   */
  formasPartes?: ParteMisto[];
  observacoes?: string | null;
  pacienteNome?: string | null;
  medicoNome?: string | null;
  usuarioNome?: string | null;
  fichaNumero?: number | null;
  status?: string | null;
  /** Ajuste gerencial: competência antiga, sem dinheiro na gaveta daquele dia. */
  retroativo?: boolean;
};

/**
 * `true` → a linha é dinheiro SAINDO da clínica.
 *
 * Despesa sempre sai. Transferência depende do sentido: sangria (dinheiro que
 * a atendente entrega ao financeiro) sai da gaveta, suprimento entra.
 */
export function ehSaida(m: MovimentacaoExtrato): boolean {
  if (m.tipo === "despesa") return true;
  if (m.tipo === "transferencia") return m.transferSentido === "saida";
  return false;
}

/**
 * `true` → a linha é apenas dinheiro TROCANDO DE CUSTÓDIA dentro da clínica.
 *
 * Sangria e suprimento movem o mesmo dinheiro entre a gaveta da recepção e o
 * financeiro: não é despesa da clínica nem receita, e ninguém ficou mais pobre
 * nem mais rico por causa delas. Elas continuam no extrato — o dinheiro
 * físico saiu de um lugar e entrou em outro, e a conferência da gaveta precisa
 * ver isso —, mas ficam FORA do resultado do período.
 *
 * Foi o que distorceu o relatório de 05/09/2026: R$ 8.500,00 de sangria
 * entravam no card "Pago (saídas)" ao lado do repasse médico e do fornecedor,
 * e derrubavam o saldo do dia como se a clínica tivesse gastado esse valor.
 */
export function ehTransferenciaInterna(m: MovimentacaoExtrato): boolean {
  return m.tipo === "transferencia";
}

/**
 * As formas de pagamento da linha, no balde canônico, com o valor de cada uma.
 *
 * Quase sempre é uma parte só. O caso que importa é o pagamento misto: com a
 * composição aberta, os R$ 187,00 de "OLGA MARIA DE OLIVEIRA" viram R$ 100,00
 * em Dinheiro e R$ 87,00 em Cartão de Crédito, que é como a recepção confere
 * contra a gaveta e contra a maquininha.
 */
export function formasCanonicasDaLinha(m: MovimentacaoExtrato): ParteMisto[] {
  const partes = (m.formasPartes ?? []).filter((p) => Number(p.valor) > 0);
  if (partes.length) return partes;
  return m.formaCanonica ? [{ forma: m.formaCanonica, valor: Number(m.valor) || 0 }] : [];
}

/**
 * O mesmo, mas em RÓTULO — é o que a coluna "Forma de Pagamento" e o resumo
 * abaixo da tabela mostram.
 *
 * Sem classificação canônica (lançamento antigo, forma em branco) vale o
 * rótulo cru da linha, para nenhuma movimentação sumir do resumo.
 */
function rotulosDeFormaDaLinha(m: MovimentacaoExtrato): ItemResumoExtrato[] {
  const partes = (m.formasPartes ?? []).filter((p) => Number(p.valor) > 0);
  if (partes.length) {
    return partes.map((p) => ({ rotulo: LABEL_FORMA[p.forma], valor: Number(p.valor) || 0 }));
  }
  return [{ rotulo: m.formaPagamento?.trim() || "(sem forma)", valor: Number(m.valor) || 0 }];
}

/**
 * Texto da coluna "Forma de Pagamento".
 *
 * O misto aberto mostra do que ele é feito — "Misto (Dinheiro + Cartão de
 * Crédito)" — em vez de esconder as partes atrás da palavra "Misto". Os
 * valores de cada parte não cabem aqui: quem precisa deles lê o resumo por
 * forma, abaixo da tabela, onde eles já entram somados no balde certo.
 */
export function rotuloFormaDaLinha(m: MovimentacaoExtrato): string {
  const partes = (m.formasPartes ?? []).filter((p) => Number(p.valor) > 0);
  if (partes.length) {
    const nomes = Array.from(new Set(partes.map((p) => LABEL_FORMA[p.forma])));
    return `Misto (${nomes.join(" + ")})`;
  }
  return m.formaPagamento?.trim() || "(sem forma)";
}

/**
 * Quem recebeu ou de quem veio o dinheiro.
 *
 * A ordem não é arbitrária — vai do vínculo mais forte para o mais fraco:
 *
 * 1. **Paciente vinculado** — mensalidade do Cartão Benefícios e recebimento
 *    de atendimento têm o paciente gravado (direto ou pelo agendamento).
 * 2. **Médico vinculado** — é o caso do repasse. Conferido em produção: as 280
 *    despesas de repasse de agosto/2026 têm `medico_id` preenchido, então o
 *    favorecido delas sai correto mesmo com a descrição automática.
 * 3. **Descrição** — o resto é despesa digitada à mão. Aí a recepção escreve
 *    ora o favorecido ("ESPEDITO ARAUJO DA SILVA"), ora o que foi comprado
 *    ("PAO P/SEMANA"): sem um cadastro de fornecedor no sistema, a descrição é
 *    a melhor informação existente, e é o que o sistema antigo também mostrava.
 *
 * Do texto da descrição só entra o trecho ANTES do travessão, porque as
 * receitas de atendimento são gravadas como "NOME DO PACIENTE — PROCEDIMENTO
 * (ESPECIALIDADE)": sem esse corte a coluna Favorecido viria com o
 * procedimento colado no nome.
 */
export function favorecidoDaLinha(m: MovimentacaoExtrato): string {
  const paciente = m.pacienteNome?.trim();
  if (paciente) return paciente;
  const medico = m.medicoNome?.trim();
  if (medico) return medico;
  return (m.descricao ?? "").split(" — ")[0].trim() || "(sem favorecido)";
}

/**
 * Categoria da linha, para a visão sintética.
 *
 * Quando o lançamento tem `categoria_id`, é ele que manda. Quando não tem, a
 * categoria é DEDUZIDA da descrição automática do repasse — e isso não é um
 * detalhe: em agosto/2026, 280 lançamentos somando R$ 167.567,84 (78% de tudo
 * que saiu) são repasses gravados sem categoria, porque a rotina que cria a
 * despesa do repasse não preenche o campo. Sem a dedução, o resumo por
 * categoria jogaria essa fatia inteira em "(SEM CATEGORIA)" e o relatório
 * nasceria inútil.
 *
 * A dedução é uma rede de segurança, não a correção: ela continua valendo para
 * as linhas antigas depois que o gerador for arrumado, e por isso fica.
 */
export function categoriaDaLinha(m: MovimentacaoExtrato): string {
  const nome = m.categoriaNome?.trim();
  if (nome) return nome.toUpperCase();
  if (m.tipo === "transferencia") return CATEGORIA_TRANSFERENCIA;
  const d = (m.descricao ?? "").toUpperCase();
  if (d.startsWith("REPASSE TERCEIRO")) return "REPASSE TERCEIRO";
  if (d.startsWith("REPASSE MEDICO") || d.startsWith("REPASSE MÉDICO")) return "REPASSE MEDICO";
  return SEM_CATEGORIA;
}

/**
 * Categorias que realmente apareceram nas movimentações carregadas.
 *
 * Alimenta o seletor de Categoria da tela junto com o cadastro de
 * `fin_categorias` (ver `opcoesDeCategoria`): sozinho, o cadastro não teria a
 * transferência entre caixas nem o `(SEM CATEGORIA)`, que não são linhas do
 * cadastro e sim rótulos deduzidos aqui.
 */
export function categoriasPresentes(movs: MovimentacaoExtrato[]): string[] {
  return Array.from(new Set(movs.map(categoriaDaLinha)));
}

/**
 * Coluna "Banco/Conta": o nome da conta com o banco entre parênteses.
 *
 * O banco só aparece quando está cadastrado e é diferente do nome da conta —
 * "CAIXA (CAIXA)" não informa nada e ainda alarga a coluna.
 */
export function bancoContaDaLinha(m: MovimentacaoExtrato): string {
  const conta = m.contaNome?.trim() ?? "";
  const banco = m.contaBanco?.trim() ?? "";
  if (!conta) return banco;
  if (!banco || banco.toUpperCase() === conta.toUpperCase()) return conta;
  return `${conta} (${banco})`;
}

/**
 * Coluna "Obs".
 *
 * Prioriza as observações digitadas. Quando não há, cai no trecho da descrição
 * DEPOIS do travessão — nas receitas de atendimento é ali que está o
 * procedimento, que é justamente a observação útil daquela linha.
 */
export function obsDaLinha(m: MovimentacaoExtrato): string {
  const obs = m.observacoes?.trim();
  if (obs) return obs;
  const partes = (m.descricao ?? "").split(" — ");
  return partes.length > 1 ? partes.slice(1).join(" — ").trim() : "";
}

/**
 * Ordem cronológica crescente (data, depois hora).
 *
 * A tela de Mov. Caixa mostra o mais recente primeiro, que é o que a recepção
 * quer. O extrato é o contrário: quem confere contra o extrato do banco lê de
 * cima para baixo, do começo do período para o fim.
 */
export function ordenarCronologico(linhas: MovimentacaoExtrato[]): MovimentacaoExtrato[] {
  return [...linhas].sort(
    (a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""),
  );
}

/**
 * Colunas de cada visão.
 *
 * As oito primeiras da analítica são exatamente as que o financeiro pediu, na
 * ordem em que pediu. As cinco seguintes não existiam no sistema antigo: são o
 * que o sistema novo sabe e ele não sabia, e ficam DEPOIS para não desarrumar
 * a leitura de quem já conhece o formato.
 *
 * `moeda-opcional` em vez de `moeda` nas colunas de dinheiro é deliberado: numa
 * linha de entrada a coluna de saída não é zero, é vazia. Com `moeda` a tela e
 * o papel imprimiriam "R$ 0,00" em metade das células de um extrato de duas mil
 * linhas, e a conferência visual se perderia no meio dos zeros.
 */
export function colunasExtrato(visao: VisaoExtrato): ColunaRateio[] {
  if (visao === "sintetico") {
    return [
      { chave: "categoria", rotulo: "Categoria", formato: "texto" },
      { chave: "qtd", rotulo: "Lançamentos", formato: "numero", somar: true },
      { chave: "pago", rotulo: "Valor Pago", formato: "moeda-opcional", somar: true },
      { chave: "recebido", rotulo: "Valor Recebido", formato: "moeda-opcional", somar: true },
      { chave: "saldo", rotulo: "Saldo", formato: "moeda", somar: true },
    ];
  }
  return [
    { chave: "data", rotulo: "Data", formato: "data" },
    { chave: "favorecido", rotulo: "Favorecido", formato: "texto" },
    { chave: "categoria", rotulo: "Categoria", formato: "texto" },
    { chave: "banco_conta", rotulo: "Banco/Conta", formato: "texto" },
    { chave: "forma", rotulo: "Forma de Pagamento", formato: "texto" },
    { chave: "obs", rotulo: "Obs", formato: "texto" },
    { chave: "pago", rotulo: "Valor Pago", formato: "moeda-opcional", somar: true },
    { chave: "recebido", rotulo: "Valor Recebido", formato: "moeda-opcional", somar: true },
    { chave: "hora", rotulo: "Hora", formato: "texto" },
    { chave: "ficha", rotulo: "Ficha", formato: "texto" },
    { chave: "descricao", rotulo: "Descrição completa", formato: "texto" },
    { chave: "usuario", rotulo: "Lançado por", formato: "texto" },
    { chave: "situacao", rotulo: "Situação", formato: "texto" },
  ];
}

/** Uma linha pronta para a tabela, lida pela `chave` das colunas. */
export type LinhaExtrato = Record<string, unknown>;

/**
 * Visão analítica: uma linha por movimentação.
 *
 * O valor cai em Pago OU em Recebido — nunca nas duas —, e a coluna que não
 * recebe o valor fica `null`, não zero.
 */
export function linhasAnaliticas(movs: MovimentacaoExtrato[]): LinhaExtrato[] {
  return ordenarCronologico(movs).map((m) => {
    const valor = Number(m.valor) || 0;
    const sai = ehSaida(m);
    return {
      data: m.data,
      favorecido: favorecidoDaLinha(m),
      categoria: categoriaDaLinha(m),
      banco_conta: bancoContaDaLinha(m),
      forma: rotuloFormaDaLinha(m),
      obs: obsDaLinha(m),
      pago: sai ? valor : null,
      recebido: sai ? null : valor,
      hora: m.hora ?? "",
      ficha: typeof m.fichaNumero === "number" ? String(m.fichaNumero).padStart(3, "0") : "",
      descricao: m.descricao ?? "",
      usuario: m.usuarioNome ?? "",
      // A marca de retroativo tem que viajar com a linha: é o que explica um
      // valor com data antiga que não estava no cupom impresso daquele dia.
      situacao: [m.status ?? "", m.retroativo ? "retroativo" : ""].filter(Boolean).join(" / "),
    };
  });
}

/**
 * Visão sintética: o mesmo dinheiro somado por categoria.
 *
 * A ordem é pelo tamanho do movimento (pago + recebido), decrescente: quem abre
 * o resumo quer ver primeiro onde está o dinheiro, não a ordem alfabética.
 * `(SEM CATEGORIA)` desce sempre para o fim, mesmo quando é grande, porque ali
 * é pendência de cadastro e não uma conta de verdade.
 */
export function linhasSinteticas(movs: MovimentacaoExtrato[]): LinhaExtrato[] {
  const porCategoria = new Map<string, { qtd: number; pago: number; recebido: number }>();

  for (const m of movs) {
    const valor = Number(m.valor) || 0;
    const cat = categoriaDaLinha(m);
    const c = porCategoria.get(cat) ?? { qtd: 0, pago: 0, recebido: 0 };
    c.qtd += 1;
    if (ehSaida(m)) c.pago += valor;
    else c.recebido += valor;
    porCategoria.set(cat, c);
  }

  return Array.from(porCategoria.entries())
    .sort((a, b) => {
      const aFim = a[0] === SEM_CATEGORIA;
      const bFim = b[0] === SEM_CATEGORIA;
      if (aFim !== bFim) return aFim ? 1 : -1;
      return b[1].pago + b[1].recebido - (a[1].pago + a[1].recebido);
    })
    .map(([categoria, v]) => ({
      categoria,
      qtd: v.qtd,
      pago: v.pago ? +v.pago.toFixed(2) : null,
      recebido: v.recebido ? +v.recebido.toFixed(2) : null,
      saldo: +(v.recebido - v.pago).toFixed(2),
    }));
}

/** Linhas da visão pedida. */
export function linhasExtrato(movs: MovimentacaoExtrato[], visao: VisaoExtrato): LinhaExtrato[] {
  return visao === "sintetico" ? linhasSinteticas(movs) : linhasAnaliticas(movs);
}

export type TotaisExtrato = {
  qtd: number;
  /** Soma da coluna "Valor Pago": despesa real MAIS sangria. */
  pago: number;
  /** Soma da coluna "Valor Recebido": receita MAIS suprimento. */
  recebido: number;
  /** `recebido - pago` — o saldo de CUSTÓDIA, que é o que a coluna fecha. */
  saldo: number;
  /** Só receita: o que a clínica faturou no período. */
  receitas: number;
  /** Só despesa de verdade: repasse, prestação de serviço, conta a pagar. */
  despesas: number;
  /** Sangria: dinheiro que saiu da gaveta para o financeiro. */
  transferSaida: number;
  /** Suprimento: dinheiro que voltou do financeiro para a gaveta. */
  transferEntrada: number;
  /** `receitas - despesas` — o RESULTADO do período, sem a custódia. */
  resultado: number;
};

/**
 * Totais do período INTEIRO — não da página exibida nem da visão escolhida.
 *
 * Saem das movimentações cruas, e não das linhas da tabela, justamente para
 * que analítica e sintética exibam o mesmo rodapé: é a igualdade dos dois
 * totais que diz à conferência que nenhuma linha ficou de fora.
 *
 * Duas leituras do mesmo período, e as duas são necessárias:
 *
 *  - **custódia** (`pago`, `recebido`, `saldo`) — tudo que saiu e tudo que
 *    entrou, sangria e suprimento incluídos. É o que fecha com a soma das
 *    colunas da tabela, e é o que a conferência da gaveta usa;
 *  - **resultado** (`receitas`, `despesas`, `resultado`) — só o dinheiro que
 *    de fato entrou ou saiu da clínica. Sangria não empobrece ninguém: é o
 *    mesmo dinheiro mudando de mão dentro de casa. Sem essa separação, os
 *    R$ 8.500,00 de sangria de 05/09/2026 apareciam como despesa do dia e
 *    derrubavam o saldo do período.
 *
 * Os dois convivem porque `pago = despesas + transferSaida` e
 * `recebido = receitas + transferEntrada`: nada é escondido, só separado.
 */
export function totaisExtrato(movs: MovimentacaoExtrato[]): TotaisExtrato {
  let receitas = 0;
  let despesas = 0;
  let transferEntrada = 0;
  let transferSaida = 0;
  for (const m of movs) {
    const valor = Number(m.valor) || 0;
    if (ehTransferenciaInterna(m)) {
      if (ehSaida(m)) transferSaida += valor;
      else transferEntrada += valor;
    } else if (ehSaida(m)) despesas += valor;
    else receitas += valor;
  }
  receitas = +receitas.toFixed(2);
  despesas = +despesas.toFixed(2);
  transferEntrada = +transferEntrada.toFixed(2);
  transferSaida = +transferSaida.toFixed(2);
  const pago = +(despesas + transferSaida).toFixed(2);
  const recebido = +(receitas + transferEntrada).toFixed(2);
  return {
    qtd: movs.length,
    pago,
    recebido,
    saldo: +(recebido - pago).toFixed(2),
    receitas,
    despesas,
    transferEntrada,
    transferSaida,
    resultado: +(receitas - despesas).toFixed(2),
  };
}

/** Uma linha do quadro de fechamento (tela, papel e planilha). */
export type ItemResumoExtrato = { rotulo: string; valor: number };

/**
 * Quebra das ENTRADAS por forma, no formato dos cards da tela.
 *
 * Passa por `receitaPorForma`, a mesma função que o Rateio e o Fechamento de
 * Caixa usam, para que a ordem das formas e as cores dos pontinhos sejam
 * idênticas nas três telas — quem confere caixa lê os três de relance e uma
 * ordem diferente em cada um faria procurar a linha errada.
 *
 * Só entradas: um card chamado "Recebido" com saída somada dentro seria
 * mentira, e as saídas já têm o resumo por forma abaixo da tabela.
 *
 * E só RECEITA: o suprimento é dinheiro que a clínica já tinha voltando para a
 * gaveta, e somá-lo aqui inflaria o "Recebido em Dinheiro" com um valor que
 * nenhum paciente pagou.
 *
 * O pagamento misto entra ABERTO, pela mesma `formasCanonicasDaLinha` que o
 * resumo abaixo da tabela usa: os R$ 187,00 pagos metade em espécie e metade
 * no crédito viram R$ 100,00 na linha do Dinheiro e R$ 87,00 na do Crédito,
 * em vez de uma linha "Misto" que a maquininha não confere.
 */
export function fatiasDeEntrada(movs: MovimentacaoExtrato[]): FatiaDaReceita[] {
  return receitaPorForma(
    movs.filter((m) => m.tipo === "receita").map((m) => ({ formas: formasCanonicasDaLinha(m) })),
  );
}

/**
 * Quebra por forma de pagamento, mostrada abaixo da tabela.
 *
 * Primeiro tudo que entrou, depois tudo que saiu: é a ordem em que o financeiro
 * concilia — as entradas contra o extrato do banco e da adquirente, as saídas
 * contra os comprovantes. Forma que não foi usada num dos sentidos não vira
 * linha de zero.
 *
 * O misto entra aberto: uma linha por parte, cada uma no seu balde. A soma do
 * quadro continua fechando com o total do período, porque as partes somam
 * exatamente o valor da linha.
 */
export function resumoPorForma(movs: MovimentacaoExtrato[]): ItemResumoExtrato[] {
  const porForma = new Map<string, { pago: number; recebido: number }>();
  for (const m of movs) {
    const sai = ehSaida(m);
    for (const parte of rotulosDeFormaDaLinha(m)) {
      const f = porForma.get(parte.rotulo) ?? { pago: 0, recebido: 0 };
      if (sai) f.pago += parte.valor;
      else f.recebido += parte.valor;
      porForma.set(parte.rotulo, f);
    }
  }
  const ordenadas = Array.from(porForma.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR"),
  );
  const itens: ItemResumoExtrato[] = [];
  for (const [forma, v] of ordenadas) {
    if (v.recebido) itens.push({ rotulo: `Recebido em ${forma}`, valor: +v.recebido.toFixed(2) });
  }
  for (const [forma, v] of ordenadas) {
    if (v.pago) itens.push({ rotulo: `Pago em ${forma}`, valor: +v.pago.toFixed(2) });
  }
  return itens;
}
