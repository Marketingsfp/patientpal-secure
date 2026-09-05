/**
 * Relatório de Sessões e Manutenções — regras puras.
 *
 * Duas naturezas convivem na mesma folha, e confundi-las seria o erro mais
 * caro deste relatório:
 *
 *  - PACOTE (Fisioterapia e afins): o paciente comprou 5 sessões e pagou na
 *    venda. A falta CONSOME a sessão — ele já pagou por ela —, então falta
 *    conta como sessão gasta. A situação financeira compara o que entrou de
 *    lançamento com o valor do pacote: Pago, Parcial ou Em aberto.
 *
 *  - CICLO (Manutenção de aparelho ortodôntico): cobrado por comparecimento.
 *    Quem não veio no mês NÃO deve nada retroativo — apenas ficou parado. Por
 *    isso a situação financeira é sempre "Por visita" e nenhuma coluna soma
 *    dívida acumulada. Somar meses não pagos aqui seria cobrar o paciente por
 *    um serviço que ele nunca recebeu.
 *
 * A lista de faltosos (busca ativa) é a interseção do que interessa às duas:
 * ainda há tratamento em aberto e não existe data futura marcada na agenda.
 */
import type { ColunaRateio as Coluna } from "@/lib/financeiro/rateio-colunas";

export type OrigemSessao = "pacote" | "ciclo";

export type SituacaoFinanceira = "pago" | "parcial" | "aberto" | "por_visita" | "movimento";

/**
 * As duas perguntas que a folha responde, e que NÃO cabem na mesma consulta.
 *
 *  - `posicao`  — "onde cada paciente está hoje". A data é referência, não
 *                 janela: tratamento em andamento aparece de qualquer data,
 *                 senão a busca ativa nunca acharia quem sumiu.
 *  - `movimento`— "o que foi realizado neste período fechado". Aí a data é
 *                 janela de verdade, e é o que o financeiro usa para conferir
 *                 produção contra o caixa.
 */
export type ModoSessoes = "posicao" | "movimento";

/** Uma linha crua, exatamente como `fn_relatorio_sessoes` devolve. */
export interface LinhaSessao {
  origem: OrigemSessao;
  paciente_id: string;
  paciente_nome: string;
  prontuario: string;
  procedimento: string;
  profissional: string;
  total_sessoes: number;
  realizadas: number;
  faltas: number;
  restantes: number;
  valor_contratado: number;
  valor_pago: number;
  situacao_financeira: SituacaoFinanceira;
  ultima_data: string | null;
  proxima_data: string | null;
  dias_parado: number | null;
  pendencia: string;
  /**
   * Janela de retorno cadastrada no procedimento, em dias.
   *
   * Nula quando o tratamento não tem ciclo cadastrado — é o caso dos pacotes de
   * fisioterapia — e no modo movimento, onde a folha é uma janela fechada de
   * produção e um prazo de retorno não descreveria nada.
   */
  ciclo_dias: number | null;
}

export type FiltroSessoes =
  | "todos"
  | "pacotes"
  | "ciclos"
  | "faltosos"
  | "financeiro"
  | "movimento";

export const ROTULO_FILTRO: Record<FiltroSessoes, string> = {
  todos: "Tudo",
  pacotes: "Só pacotes (Fisioterapia)",
  ciclos: "Só manutenções (Odonto)",
  faltosos: "Busca ativa — sem agendamento",
  financeiro: "Pendência financeira",
  movimento: "Movimento do período (produção)",
};

/**
 * "Movimento" não é um recorte da mesma lista, como os outros: é outra
 * pergunta, com outra consulta ao banco e outras colunas. Ele mora no mesmo
 * seletor porque para quem usa é só "o que eu quero ver", mas por dentro
 * precisa recarregar.
 */
export function modoDoFiltro(f: FiltroSessoes): ModoSessoes {
  return f === "movimento" ? "movimento" : "posicao";
}

export const ROTULO_SITUACAO: Record<SituacaoFinanceira, string> = {
  pago: "Pago integral",
  parcial: "Parcial",
  aberto: "Em aberto",
  // No modo movimento a coluna nem é exibida: comparar o dinheiro de um mês
  // com o total de um pacote vendido em outro não diz nada.
  movimento: "—",
  por_visita: "Por visita",
};

export const ROTULO_ORIGEM: Record<OrigemSessao, string> = {
  pacote: "Pacote",
  ciclo: "Manutenção",
};

/**
 * Paciente que precisa de busca ativa: tem tratamento em andamento e nenhuma
 * data futura na agenda.
 *
 * No pacote, "em andamento" é sobrar sessão. No ciclo não existe fim, então
 * qualquer paciente sem próxima data conta — é a régua de dias parados que
 * separa quem está em dia de quem sumiu, e ela já vem calculada do banco.
 */
export function precisaBuscaAtiva(l: LinhaSessao): boolean {
  if (l.proxima_data) return false;
  return l.origem === "ciclo" ? true : l.restantes > 0;
}

/**
 * Pendência de dinheiro. Só existe em pacote: no ciclo, faltar não gera
 * dívida, então uma manutenção nunca entra nesta lista.
 */
export function temPendenciaFinanceira(l: LinhaSessao): boolean {
  if (l.origem === "ciclo") return false;
  return l.situacao_financeira === "aberto" || l.situacao_financeira === "parcial";
}

export function filtrarSessoes(linhas: LinhaSessao[], filtro: FiltroSessoes): LinhaSessao[] {
  switch (filtro) {
    case "pacotes":
      return linhas.filter((l) => l.origem === "pacote");
    case "ciclos":
      return linhas.filter((l) => l.origem === "ciclo");
    case "faltosos":
      return linhas.filter(precisaBuscaAtiva);
    case "financeiro":
      return linhas.filter(temPendenciaFinanceira);
    default:
      return linhas;
  }
}

/**
 * "3/5" no pacote; no ciclo não existe total contratado, então sai a contagem
 * de comparecimentos. Escrever "3/0" para uma manutenção sugeriria um pacote
 * que não existe.
 */
export function rotuloSessoes(l: LinhaSessao, modo: ModoSessoes = "posicao"): string {
  if (l.origem === "ciclo") {
    return `${l.realizadas} visita${l.realizadas === 1 ? "" : "s"}`;
  }
  // Em movimento não existe "3/5": o 5 é o tamanho do pacote inteiro e a
  // pergunta é quantas aconteceram DENTRO da janela. Escrever "3/5" faria
  // parecer que o pacote todo cabe no mês consultado.
  if (modo === "movimento") {
    return `${l.realizadas} sess${l.realizadas === 1 ? "ão" : "ões"}`;
  }
  return `${l.realizadas}/${l.total_sessoes}`;
}

/** Linha pronta para a tabela, a folha A4, o CSV e o Excel — a mesma para os quatro. */
export function linhaExibida(
  l: LinhaSessao,
  modo: ModoSessoes = "posicao",
): Record<string, unknown> {
  return {
    origem: ROTULO_ORIGEM[l.origem],
    paciente: l.paciente_nome,
    prontuario: l.prontuario || "",
    procedimento: l.procedimento,
    profissional: l.profissional,
    sessoes: rotuloSessoes(l, modo),
    faltas: l.faltas,
    restantes: l.origem === "ciclo" ? null : l.restantes,
    situacao: ROTULO_SITUACAO[l.situacao_financeira],
    valor_contratado: l.origem === "ciclo" ? null : l.valor_contratado,
    valor_pago: l.valor_pago,
    ultima_data: l.ultima_data,
    proxima_data: l.proxima_data,
    dias_parado: l.dias_parado,
    pendencia: l.pendencia,
  };
}

export function linhasSessoes(
  linhas: LinhaSessao[],
  filtro: FiltroSessoes,
): Record<string, unknown>[] {
  const modo = modoDoFiltro(filtro);
  return filtrarSessoes(linhas, filtro).map((l) => linhaExibida(l, modo));
}

export const COLUNAS_SESSOES: Coluna[] = [
  { chave: "origem", rotulo: "Tipo", formato: "texto" },
  { chave: "paciente", rotulo: "Paciente", formato: "texto" },
  { chave: "prontuario", rotulo: "Prontuário", formato: "texto" },
  { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
  { chave: "profissional", rotulo: "Profissional", formato: "texto" },
  { chave: "sessoes", rotulo: "Realizadas", formato: "texto" },
  { chave: "faltas", rotulo: "Faltas", formato: "numero", somar: true },
  { chave: "restantes", rotulo: "A fazer", formato: "numero", somar: true },
  { chave: "situacao", rotulo: "Situação financeira", formato: "texto" },
  { chave: "valor_contratado", rotulo: "Contratado", formato: "moeda-opcional", somar: true },
  { chave: "valor_pago", rotulo: "Recebido", formato: "moeda", somar: true },
  { chave: "ultima_data", rotulo: "Última", formato: "data" },
  { chave: "proxima_data", rotulo: "Próxima", formato: "data" },
  { chave: "dias_parado", rotulo: "Dias parado", formato: "numero" },
  { chave: "pendencia", rotulo: "Situação", formato: "texto" },
];

/**
 * Colunas do modo movimento.
 *
 * Some tudo que descreve o pacote INTEIRO — Contratado, A fazer, Situação
 * financeira, Dias parado. Numa folha de produção do mês essas colunas ou
 * viriam zeradas ou, pior, convidariam a comparar o dinheiro do mês com o
 * valor de um pacote vendido em outro. Sobra o que a conferência precisa:
 * quem, o quê, quantas e quanto entrou.
 */
export const COLUNAS_SESSOES_MOVIMENTO: Coluna[] = [
  { chave: "origem", rotulo: "Tipo", formato: "texto" },
  { chave: "paciente", rotulo: "Paciente", formato: "texto" },
  { chave: "prontuario", rotulo: "Prontuário", formato: "texto" },
  { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
  { chave: "profissional", rotulo: "Profissional", formato: "texto" },
  { chave: "sessoes", rotulo: "Realizadas no período", formato: "texto" },
  { chave: "faltas", rotulo: "Faltas", formato: "numero", somar: true },
  { chave: "valor_pago", rotulo: "Recebido no período", formato: "moeda", somar: true },
  { chave: "ultima_data", rotulo: "Último atendimento", formato: "data" },
  { chave: "proxima_data", rotulo: "Próxima marcada", formato: "data" },
];

export function colunasSessoes(modo: ModoSessoes): Coluna[] {
  return modo === "movimento" ? COLUNAS_SESSOES_MOVIMENTO : COLUNAS_SESSOES;
}

// ============================================================================
// VISÃO COMPACTA — só a tela
// ============================================================================
//
// As quinze colunas acima são a folha de conferência do financeiro, e é assim
// que elas saem no Excel, no CSV e no papel. Na TELA elas não cabiam: em
// 1366x768 a tabela pedia rolagem lateral e os nomes dos pacientes quebravam em
// três e quatro linhas, o que transformava a lista de busca ativa — que a
// recepção lê correndo o olho, entre uma ligação e outra — numa parede de
// texto.
//
// A saída não foi esconder informação, e sim agrupar o que sempre é lido junto:
//
//   - prontuário entra embaixo do nome, profissional embaixo do procedimento;
//   - "Realizadas", "Faltas" e "A fazer" viram uma frase só;
//   - "Situação financeira", "Contratado" e "Recebido" viram o saldo, que é o
//     único número sobre o qual alguém age;
//   - "Próxima" entra dentro da etiqueta de situação, e a etiqueta perde o
//     "— 58 dias sem manutenção", que é exatamente a coluna Dias parado ao lado.
//
// Nada disso muda o que é exportado: quem confere produção continua recebendo a
// planilha com uma coluna por número.
// ============================================================================

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Quantos atendimentos aconteceram, numa frase.
 *
 * Falta e "a fazer" só aparecem quando existem. Escrever "0 faltas" em vinte e
 * oito linhas seguidas é ruído: quem varre a lista procura a linha que tem
 * falta, e ela some no meio dos zeros.
 */
export function resumoAtendimentos(l: LinhaSessao, modo: ModoSessoes = "posicao"): string {
  const partes: string[] = [rotuloSessoes(l, modo)];
  if (l.origem === "pacote" && modo === "posicao" && l.restantes > 0) {
    partes.push(`${l.restantes} a fazer`);
  }
  if (l.faltas > 0) partes.push(`${l.faltas} falta${l.faltas === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

/**
 * A situação financeira reduzida ao que exige ação: o saldo a receber.
 *
 * Pacote pago e manutenção não têm saldo, então saem só com o rótulo. A
 * manutenção nunca acumula dívida — ver o cabeçalho deste arquivo —, e por isso
 * jamais ganha um valor "em aberto" aqui.
 */
export function resumoFinanceiro(l: LinhaSessao): string {
  if (l.origem === "ciclo") return "Por visita";
  const aberto = Math.max(0, l.valor_contratado - l.valor_pago);
  if (l.situacao_financeira === "pago" || aberto <= 0.004) return "Pago";
  if (l.situacao_financeira === "parcial") return `Parcial · ${brl(aberto)} a receber`;
  return `Em aberto · ${brl(aberto)}`;
}

/**
 * A situação em uma etiqueta curta.
 *
 * O banco devolve frases completas ("Abandono — 83 dias sem manutenção"), que
 * são as certas para o papel. Na tela o número de dias já tem coluna própria ao
 * lado, então repeti-lo dentro da etiqueta só consumia largura. O ano da
 * próxima data também sai: a recepção está marcando para as próximas semanas.
 */
export function situacaoCurta(pendencia: string): string {
  const p = pendencia.trim();
  if (p.startsWith("Próxima em ")) return `Próxima ${p.slice("Próxima em ".length, -5)}`;
  if (p.startsWith("Abandono")) return "Abandono";
  if (p.startsWith("Atrasado")) return "Atrasado";
  if (p === "Pacote concluído") return "Concluído";
  return p;
}

/** Como a etiqueta de situação deve ser pintada. A cor em si mora na tela. */
export type TomSituacao = "verde" | "azul" | "ambar" | "vermelho" | "neutro";

export function tomDaSituacao(situacao: string): TomSituacao {
  if (situacao.startsWith("Próxima")) return "azul";
  if (situacao === "Em dia") return "verde";
  if (situacao === "Abandono") return "vermelho";
  // "Sem agendamento" e "Atrasado" são os dois estados que pedem uma ligação
  // hoje. Ficam no mesmo tom de propósito: para a recepção são o mesmo trabalho.
  if (situacao === "Atrasado" || situacao === "Sem agendamento") return "ambar";
  return "neutro";
}

/** A linha como a TELA a desenha. Nunca vai para o CSV, o Excel ou o papel. */
export function linhaTela(l: LinhaSessao, modo: ModoSessoes = "posicao"): Record<string, unknown> {
  return {
    paciente: l.paciente_nome,
    // Campos de apoio das células de duas linhas. Não têm coluna própria: são
    // desenhados dentro da célula do nome e da do procedimento.
    prontuario: l.prontuario || "",
    profissional: l.profissional,
    origem: ROTULO_ORIGEM[l.origem],
    procedimento: l.procedimento,
    atendimentos: resumoAtendimentos(l, modo),
    financeiro: resumoFinanceiro(l),
    valor_pago: l.valor_pago,
    ultima_data: l.ultima_data,
    proxima_data: l.proxima_data,
    dias_parado: l.dias_parado,
    situacao_curta: situacaoCurta(l.pendencia),
  };
}

export function linhasTela(
  linhas: LinhaSessao[],
  filtro: FiltroSessoes,
): Record<string, unknown>[] {
  const modo = modoDoFiltro(filtro);
  return filtrarSessoes(linhas, filtro).map((l) => linhaTela(l, modo));
}

/**
 * Nove colunas em vez de quinze — e duas delas, "Último contato" e "Ação",
 * ainda são acrescentadas pela tela. É o que faz a lista caber em 1366px sem
 * rolagem lateral.
 */
export const COLUNAS_SESSOES_TELA: Coluna[] = [
  { chave: "paciente", rotulo: "Paciente", formato: "texto" },
  { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
  { chave: "atendimentos", rotulo: "Atendimentos", formato: "texto" },
  { chave: "financeiro", rotulo: "Financeiro", formato: "texto" },
  { chave: "ultima_data", rotulo: "Última", formato: "data" },
  { chave: "dias_parado", rotulo: "Parado", formato: "numero" },
  { chave: "situacao_curta", rotulo: "Situação", formato: "texto" },
];

/**
 * No movimento não existe busca ativa: a pergunta é produção do período. Some a
 * situação (que descreve a posição de hoje) e o saldo do pacote, e entra o
 * dinheiro que entrou na janela — que é o que fecha com o caixa.
 */
export const COLUNAS_SESSOES_TELA_MOVIMENTO: Coluna[] = [
  { chave: "paciente", rotulo: "Paciente", formato: "texto" },
  { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
  { chave: "atendimentos", rotulo: "Realizadas no período", formato: "texto" },
  { chave: "valor_pago", rotulo: "Recebido", formato: "moeda", somar: true },
  { chave: "ultima_data", rotulo: "Último atendimento", formato: "data" },
  { chave: "proxima_data", rotulo: "Próxima marcada", formato: "data" },
];

export function colunasSessoesTela(modo: ModoSessoes): Coluna[] {
  return modo === "movimento" ? COLUNAS_SESSOES_TELA_MOVIMENTO : COLUNAS_SESSOES_TELA;
}

/**
 * Sessão de pacote e visita de manutenção NÃO se somam.
 *
 * Elas parecem a mesma coisa na tabela (as duas caem na coluna "Realizadas"),
 * mas contá-las juntas produz frases sem sentido, do tipo "30 realizadas de 10
 * contratadas": as 10 contratadas vêm só dos pacotes, enquanto as 30 incluíam
 * visitas de manutenção, que não têm total contratado nenhum. Por isso os
 * campos de pacote e de manutenção vivem separados aqui, e só os campos com
 * sufixo `Coluna` — usados no rodapé da tabela — somam as duas naturezas, para
 * bater com o que está impresso na coluna.
 */
export interface TotaisSessoes {
  linhas: number;
  pacotes: number;
  ciclos: number;
  /** Pacotes: total vendido, realizadas, faltas e o que ainda falta fazer. */
  sessoesContratadas: number;
  sessoesRealizadas: number;
  faltasPacote: number;
  sessoesRestantes: number;
  /** Manutenção: comparecimentos e faltas, sem total contratado. */
  visitasManutencao: number;
  faltasManutencao: number;
  /** Soma das duas naturezas — só para o rodapé bater com a coluna. */
  faltasColuna: number;
  contratado: number;
  recebido: number;
  emAberto: number;
  buscaAtiva: number;
}

export function totaisSessoes(linhas: LinhaSessao[]): TotaisSessoes {
  const t: TotaisSessoes = {
    linhas: linhas.length,
    pacotes: 0,
    ciclos: 0,
    sessoesContratadas: 0,
    sessoesRealizadas: 0,
    faltasPacote: 0,
    sessoesRestantes: 0,
    visitasManutencao: 0,
    faltasManutencao: 0,
    faltasColuna: 0,
    contratado: 0,
    recebido: 0,
    emAberto: 0,
    buscaAtiva: 0,
  };
  for (const l of linhas) {
    if (l.origem === "ciclo") {
      t.ciclos += 1;
      t.visitasManutencao += l.realizadas;
      t.faltasManutencao += l.faltas;
    } else {
      t.pacotes += 1;
      t.sessoesContratadas += l.total_sessoes;
      t.sessoesRealizadas += l.realizadas;
      t.faltasPacote += l.faltas;
      t.sessoesRestantes += l.restantes;
      t.contratado += l.valor_contratado;
      // Saldo a receber só existe em pacote. No ciclo, o que não foi pago é
      // consulta que não aconteceu — não é saldo devedor de ninguém.
      t.emAberto += Math.max(0, l.valor_contratado - l.valor_pago);
    }
    t.faltasColuna += l.faltas;
    t.recebido += l.valor_pago;
    if (precisaBuscaAtiva(l)) t.buscaAtiva += 1;
  }
  return t;
}

/** Quadro de fechamento, igual na tela, no papel e na planilha. */
export function resumoSessoes(
  t: TotaisSessoes,
  modo: ModoSessoes = "posicao",
): { rotulo: string; valor: string }[] {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // No movimento, "contratadas", "a fazer" e "saldo a receber" sairiam todos
  // zerados — eles descrevem o pacote inteiro, e a folha aqui é só a janela.
  // Zero numa linha dessas seria lido como "não falta nada a fazer".
  if (modo === "movimento") {
    return [
      { rotulo: "Sessões de pacote realizadas", valor: n(t.sessoesRealizadas) },
      { rotulo: "Visitas de manutenção", valor: n(t.visitasManutencao) },
      { rotulo: "Faltas no período", valor: n(t.faltasColuna) },
      { rotulo: "Pacientes atendidos", valor: n(t.linhas) },
      { rotulo: "Recebido no período", valor: brl(t.recebido) },
    ];
  }
  return [
    { rotulo: "Pacotes de sessões", valor: n(t.pacotes) },
    { rotulo: "Sessões contratadas", valor: n(t.sessoesContratadas) },
    { rotulo: "Sessões realizadas", valor: n(t.sessoesRealizadas) },
    { rotulo: "Sessões a fazer", valor: n(t.sessoesRestantes) },
    { rotulo: "Faltas em pacote", valor: n(t.faltasPacote) },
    // Bloco à parte, e não somado ao de cima: visita de manutenção não é
    // sessão de pacote, e juntar as duas produz "30 realizadas de 10
    // contratadas".
    { rotulo: "Pacientes em manutenção", valor: n(t.ciclos) },
    { rotulo: "Visitas de manutenção", valor: n(t.visitasManutencao) },
    { rotulo: "Faltas em manutenção", valor: n(t.faltasManutencao) },
    { rotulo: "Recebido (tudo)", valor: brl(t.recebido) },
    { rotulo: "Saldo a receber (só pacotes)", valor: brl(t.emAberto) },
    { rotulo: "Sem agendamento (busca ativa)", valor: n(t.buscaAtiva) },
  ];
}

// ============================================================================
// STATUS DE RETORNO — os três cards de acompanhamento
// ============================================================================
//
// A coordenação acompanha o resgate por três números: quantos já venceram,
// quantos vencem nos próximos dias e quantos estão em dia. É a mesma régua da
// coluna Situação, só que contada — e é de propósito que as duas usem a mesma
// conta: dois números discordando na mesma linha ("Vencido" no card, "Em dia"
// na coluna) destruiria a confiança na lista inteira.
//
// A janela de cada linha é o `ciclo_dias` do procedimento, que vem do banco.
// Quem não tem ciclo cadastrado cai na janela padrão abaixo.
// ============================================================================

/**
 * Janela usada quando o tratamento não tem ciclo cadastrado.
 *
 * Hoje só os pacotes de fisioterapia caem aqui: o cadastro de procedimentos tem
 * `ciclo_dias` preenchido nas quatro manutenções de aparelho, e vazio no resto.
 * Trinta dias é o mesmo prazo das manutenções — é um palpite explícito, e não
 * uma regra da clínica. No dia em que a fisioterapia tiver um prazo próprio de
 * retorno, basta cadastrá-lo no procedimento: os cards passam a segui-lo sem
 * mudar uma linha de código.
 */
export const JANELA_PADRAO_DIAS = 30;

/** Quantos dias antes do vencimento a linha entra em "A vencer". */
export const AVISO_DIAS = 7;

export type StatusRetorno = "vencido" | "a_vencer" | "em_dia" | "sem_prazo";

export const ROTULO_STATUS: Record<StatusRetorno, string> = {
  vencido: "Vencido",
  a_vencer: "A vencer",
  em_dia: "Em dia",
  sem_prazo: "Sem prazo",
};

/**
 * Em que ponto do prazo de retorno esta linha está.
 *
 * A ordem das perguntas importa:
 *
 *  1. pacote concluído sai da conta — não há retorno a acompanhar, e contá-lo
 *     como "em dia" incharia o card verde com tratamento que acabou;
 *  2. quem TEM data marcada está em dia, por definição e sem exceção. É a mesma
 *     regra da coluna Situação, e a única leitura possível: o paciente já
 *     voltou para a agenda;
 *  3. o resto se mede pelos dias parados contra a janela do procedimento.
 */
export function statusRetorno(l: LinhaSessao): StatusRetorno {
  if (l.origem === "pacote" && l.restantes === 0) return "sem_prazo";
  if (l.proxima_data) return "em_dia";
  const janela = l.ciclo_dias && l.ciclo_dias > 0 ? l.ciclo_dias : JANELA_PADRAO_DIAS;
  const parado = l.dias_parado ?? 0;
  // `>` e não `>=`, para bater exatamente com o "Atrasado" que o banco escreve
  // na coluna Situação: no trigésimo dia do ciclo de trinta o paciente ainda
  // está dentro do prazo.
  if (parado > janela) return "vencido";
  if (parado >= janela - AVISO_DIAS) return "a_vencer";
  return "em_dia";
}

export interface ContagemStatus {
  vencido: number;
  aVencer: number;
  emDia: number;
  /** Pacotes concluídos: aparecem na tabela, mas não em card nenhum. */
  semPrazo: number;
}

export function contarStatus(linhas: LinhaSessao[]): ContagemStatus {
  const c: ContagemStatus = { vencido: 0, aVencer: 0, emDia: 0, semPrazo: 0 };
  for (const l of linhas) {
    const s = statusRetorno(l);
    if (s === "vencido") c.vencido += 1;
    else if (s === "a_vencer") c.aVencer += 1;
    else if (s === "em_dia") c.emDia += 1;
    else c.semPrazo += 1;
  }
  return c;
}

/**
 * Recorte por status, aplicado DEPOIS do filtro do seletor.
 *
 * São duas perguntas empilhadas, e não uma só: "quero ver as manutenções" e,
 * dentro delas, "só as vencidas". Por isso o clique no card não substitui o
 * seletor — ele estreita o que o seletor já escolheu.
 */
export function filtrarPorStatus(
  linhas: LinhaSessao[],
  status: StatusRetorno | null,
): LinhaSessao[] {
  if (!status) return linhas;
  return linhas.filter((l) => statusRetorno(l) === status);
}
