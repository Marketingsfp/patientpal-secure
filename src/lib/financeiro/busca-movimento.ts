/**
 * Regras da busca por texto livre do Movimento de Caixa.
 *
 * A tela nasceu para bater com o cupom impresso do dia: o período De/Até é o
 * recorte, e tudo o que ela mostra tem que ser o que passou pela gaveta
 * naquela data. A busca por nome de paciente/descrição convive com isso de
 * duas formas:
 *
 * 1. **Dentro do período** (padrão) — o texto só estreita o que já está na
 *    tela. O cupom continua fechando, porque o recorte de data não mudou.
 * 2. **Em todas as datas** (opcional, ligado pelo usuário) — a trava de data
 *    sai e a busca varre o histórico inteiro da clínica. Serve para achar um
 *    pagamento antigo sem adivinhar o dia, mas nesse modo a tela deixa de ser
 *    a conferência do caixa e vira consulta.
 *
 * Este módulo concentra só a decisão de qual dos dois modos vale, para que a
 * regra possa ser testada sem montar a tela inteira.
 */

/**
 * Mínimo de caracteres para liberar a busca sem trava de data.
 *
 * Sem piso, um único caractere casaria com quase todos os 900 mil
 * lançamentos: o banco varreria a tabela toda para devolver um resultado que
 * não ajuda ninguém. Dentro do período o piso não se aplica — ali o recorte
 * de data já limita o volume.
 */
export const TERMO_MINIMO = 3;

/**
 * Teto de linhas trazidas na busca em todas as datas.
 *
 * A busca por período pagina até 20.000 linhas porque precisa somar o
 * movimento inteiro. A busca global não soma caixa nenhum — ela procura uma
 * transação — então para no primeiro lote e mostra os mais recentes. Medido
 * em produção: uma varredura destas custa ~0,5 s; repeti-la 20 vezes deixaria
 * a recepção esperando 10 s por um resultado que ela nem lê até o fim.
 */
export const LIMITE_BUSCA_GLOBAL = 1000;

/**
 * Limpa o que o usuário digitou: tira espaços das pontas e colapsa espaços
 * repetidos do meio, para "MARIA   SILVA" achar "MARIA SILVA".
 */
export function normalizarTermoBusca(termo: string | null | undefined): string {
  return (termo ?? "").trim().replace(/\s+/g, " ");
}

/** true → o usuário digitou alguma coisa que vale filtrar. */
export function buscaAtiva(termo: string | null | undefined): boolean {
  return normalizarTermoBusca(termo).length > 0;
}

/**
 * Decide se a consulta ao banco deve ignorar o período De/Até.
 *
 * Só é verdade quando as duas condições valem juntas: o usuário pediu
 * explicitamente "todas as datas" E o termo tem tamanho suficiente. Ligar a
 * chave com a caixa de busca vazia (ou com uma letra só) não pode derrubar a
 * trava de data — seria baixar o histórico inteiro da clínica sem motivo.
 */
export function buscaEmTodasAsDatas(params: {
  termo: string | null | undefined;
  todasAsDatas: boolean;
}): boolean {
  return params.todasAsDatas && normalizarTermoBusca(params.termo).length >= TERMO_MINIMO;
}

/**
 * Mensagem de contexto mostrada ao lado dos resultados.
 *
 * `null` quando a tela está no modo normal — nesse caso ela é a conferência
 * do caixa e não precisa de aviso. Quando a busca global está valendo, o
 * aviso é obrigatório: os totais na tela passam a cobrir várias datas e não
 * fecham mais com o cupom do dia.
 */
export function avisoDaBuscaGlobal(params: {
  termo: string | null | undefined;
  todasAsDatas: boolean;
  /**
   * true → algum dos lotes buscados bateu no teto e a lista está cortada.
   * Quem sabe disso é a tela, que conta cada lote separadamente — daí vir
   * pronto como sim/não em vez de uma quantidade para comparar aqui.
   */
  truncado: boolean;
}): string | null {
  if (!buscaEmTodasAsDatas(params)) return null;
  const termo = normalizarTermoBusca(params.termo);
  const base = `Busca em todas as datas por "${termo}" — os totais desta tela cobrem várias datas e não fecham com o cupom do dia.`;
  return params.truncado
    ? `${base} A lista está cortada nos mais recentes; refine o texto para ver os demais.`
    : base;
}
