/**
 * Escolha do paciente para o resumo da transferência (homologação 13–14/10/2026).
 *
 * O motivo e o resumo levavam o último profissional consultado (o paciente
 * escolheu Mariana e saiu "Marcele"), listavam todos os profissionais, ignoravam
 * a troca feita junto com os dados ("na verdade, quinta com o Milton") e não
 * registravam dia, período nem forma de pagamento. Aqui a escolha é lida das
 * mensagens do paciente, da mais recente para a mais antiga.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";
import { extrairDadosTransferencia } from "./dados-transferencia";

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e"]);
const TITULOS = new Set(["dr", "dra", "doutor", "doutora", "prof", "profa"]);

const chave = (t: string) => normalizarRespostaInformal(t ?? "").replace(/[?]/g, " ");

function partesDoNome(nome: string): string[] {
  return chave(nome)
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !CONECTORES.has(p) && !TITULOS.has(p));
}

/**
 * Profissionais citados pelo nome na mensagem. Só conta quem foi citado pelo
 * primeiro nome, por duas partes do nome ou com "Dr./Dra." antes: um sobrenome
 * solto que também é palavra comum ("quais dias?" × "Marina Almeida Dias") ou o
 * sobrenome do próprio paciente não é escolha (homologação 15/10/2026, ~35
 * ciclos). Com mais de um candidato, fica o que tem mais partes citadas
 * ("Carlos Eduardo" → Carlos Eduardo, não Carlos Alberto). Empate continua
 * empatado.
 */
export function profissionaisCitados(texto: string, nomes: readonly string[]): string[] {
  const t = ` ${chave(texto)} `;
  const pontos = nomes.map((nome) => {
    const partes = partesDoNome(nome);
    const citadas = partes.filter((p) => t.includes(` ${p} `));
    const comTitulo = citadas.some((p) =>
      new RegExp(`\\b(?:dr|dra|doutor|doutora)\\.? ${p}\\b`).test(t),
    );
    const aceito = citadas.includes(partes[0] ?? "") || citadas.length >= 2 || comTitulo;
    return { nome, n: aceito ? citadas.length : 0 };
  });
  const melhor = Math.max(0, ...pontos.map((p) => p.n));
  if (!melhor) return [];
  return [...new Set(pontos.filter((p) => p.n === melhor).map((p) => p.nome))];
}

const DIAS: [RegExp, string][] = [
  // "essa segunda opção" não é dia.
  [/\bsegunda(?:[- ]feira)?\b(?! (?:opcao|vez|via|alternativa|op))/g, "segunda-feira"],
  [/\bterca(?:[- ]feira)?\b/g, "terça-feira"],
  [/\bquarta(?:[- ]feira)?\b/g, "quarta-feira"],
  [/\bquinta(?:[- ]feira)?\b/g, "quinta-feira"],
  [/\bsexta(?:[- ]feira)?\b/g, "sexta-feira"],
  [/\bsab(?:ado)?\b/g, "sábado"],
  [/\bdomingo\b/g, "domingo"],
  [/\bamanha\b/g, "amanhã"],
];

/** Minúsculas sem acento, mas COM a pontuação: a vírgula separa "débito, não pix". */
const comPontuacao = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * "não quero pix", "sem pix", "e não sexta" (recusa antes) ou "quarta não,",
 * "pix não" no fim, "quarta não prefiro…" (recusa depois). "débito, não pix"
 * recusa o Pix, não o débito.
 */
function negada(t: string, inicio: number, fim: number): boolean {
  const antes = t.slice(Math.max(0, inicio - 30), inicio);
  const depois = t.slice(fim, fim + 20);
  return (
    /\b(?:nao|n|sem|nunca|nada de)\s+(?:(?:quero|vou|pagar|pago|posso|consigo|ir|vai|da|no|na|de|o|a|com|e|em|pelo|pela)\s+){0,2}$/.test(
      antes,
    ) ||
    /^\s*(?:nao|n)\b(?=\s*(?:[,.;!?]|$)|\s+(?:quero|da|consigo|posso|vai|serve|rola|prefiro|melhor|pode)\b)/.test(
      depois,
    )
  );
}

/** Última menção aceita (não recusada) entre as opções, pela posição no texto. */
function ultimaMencao(t: string, opcoes: readonly [RegExp, string][]): string | null {
  let melhor: { pos: number; valor: string } | null = null;
  for (const [re, valor] of opcoes)
    for (const m of t.matchAll(new RegExp(re.source, "g"))) {
      const pos = m.index ?? 0;
      if (negada(t, pos, pos + m[0].length)) continue;
      if (!melhor || pos > melhor.pos) melhor = { pos, valor };
    }
  return melhor?.valor ?? null;
}

function diaDe(t: string): string | null {
  return ultimaMencao(t, DIAS);
}

const PERIODOS: [RegExp, string][] = [
  [/\b(?:de |pela |na |a )?manha\b/g, "manhã"],
  [/\bcedo\b/g, "manhã"],
  [/\b(?:de |pela |na |a )?tarde\b/g, "tarde"],
  [/\b(?:de |pela |na |a )?noite\b/g, "noite"],
];

function periodoDe(t: string): string | null {
  const periodo = ultimaMencao(t, PERIODOS);
  if (periodo) return periodo;
  const hora = /\b(?:as |a partir das )?(\d{1,2})(?:h|:\d{2}| horas)\b/.exec(t);
  return hora ? `${hora[1]}h` : null;
}

const PAGAMENTOS: [RegExp, string][] = [
  [/\bpix\b/g, "Pix"],
  [/\bdebito\d*\b/g, "cartão de débito"],
  [/\bcredito\d*\b/g, "cartão de crédito"],
  [/\bcartao\b(?! (?:de )?(?:consulta|beneficio|desconto))/g, "cartão"],
  [/\bdinheiro\d*\b/g, "dinheiro"],
];

function pagamentoDe(t: string): string | null {
  return ultimaMencao(t, PAGAMENTOS);
}

export type EscolhaPaciente = {
  profissional: string | null;
  dia: string | null;
  periodo: string | null;
  pagamento: string | null;
};

/** O nome do próprio paciente (ou do parente) não é escolha de profissional. */
function semNomesDoPaciente(texto: string): string {
  let limpo = texto.replace(
    /(?:meu nome(?: completo)?(?: (?:é|e))?|me chamo|eu sou(?: (?:o|a))?|sou (?:o|a)|nome(?: completo)?\s*:|paciente(?: (?:é|e))?\s*:?|nome d(?:ele|ela)(?: (?:é|e))?\s*:?|o d(?:ele|ela)|se chama)[^.,;\n]*/gi,
    " ",
  );
  const lido = extrairDadosTransferencia(texto);
  for (const nome of [lido.nome_completo, lido.responsavel])
    for (const parte of String(nome ?? "").split(/\s+/))
      if (parte.length >= 3)
        limpo = limpo.replace(new RegExp(`(?<![\\p{L}])${parte}(?![\\p{L}])`, "giu"), " ");
  return limpo;
}

/**
 * Escolha mais recente: profissional, dia e período saem da mensagem mais
 * recente que cita profissional ou dia (a troca vale sobre a escolha antiga);
 * o que faltar nela vem da mensagem anterior mais próxima. A forma de pagamento
 * é a última citada e não recusada.
 */
export function escolhaNaConversa(
  textos: readonly string[],
  nomes: readonly string[],
): EscolhaPaciente {
  const lidas = textos.map((texto) => {
    const citados = profissionaisCitados(semNomesDoPaciente(texto), nomes);
    return {
      profissional: citados.length === 1 ? citados[0]! : null,
      dia: diaDe(comPontuacao(texto)),
      periodo: periodoDe(comPontuacao(texto)),
      pagamento: pagamentoDe(comPontuacao(texto)),
    };
  });
  const escolha: EscolhaPaciente = {
    profissional: null,
    dia: null,
    periodo: null,
    pagamento: null,
  };
  const principal = lidas.find((l) => l.profissional || l.dia);
  if (principal) {
    escolha.profissional = principal.profissional;
    escolha.dia = principal.dia;
    escolha.periodo = principal.periodo;
  }
  const inicio = principal ? lidas.indexOf(principal) : 0;
  for (const l of lidas.slice(inicio)) {
    escolha.profissional ??= l.profissional;
    if (!escolha.dia && l.dia) {
      escolha.dia = l.dia;
      escolha.periodo ??= l.periodo;
    }
  }
  escolha.pagamento = lidas.find((l) => l.pagamento)?.pagamento ?? null;
  return escolha;
}

function nomeLegivel(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p) => (CONECTORES.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

const ROTULO_ESCOLHA = "Escolha do paciente:";

/** "Escolha do paciente: Mariana Portugal · segunda-feira de manhã · pagamento: dinheiro." */
export function linhaEscolha(e: EscolhaPaciente): string | null {
  const partes = [
    e.profissional ? nomeLegivel(e.profissional) : null,
    e.dia ? `${e.dia}${e.periodo ? ` (${e.periodo})` : ""}` : e.periodo,
    e.pagamento ? `pagamento: ${e.pagamento}` : null,
  ].filter(Boolean);
  return partes.length ? `${ROTULO_ESCOLHA} ${partes.join(" · ")}.` : null;
}

/** Troca (ou inclui) a linha da escolha no resumo, sem duplicar. */
export function resumoComEscolha(resumo: string | null | undefined, linha: string | null): string {
  const linhas = String(resumo ?? "")
    .split("\n")
    .filter((l) => !l.startsWith(ROTULO_ESCOLHA));
  if (!linha) return linhas.join("\n").trim();
  // Logo depois do nome, da data e do responsável, quando existirem.
  let pos = 0;
  while (
    pos < linhas.length &&
    /^(?:Nome completo|Data de nascimento|Responsável que fez o contato):/.test(linhas[pos]!)
  )
    pos++;
  linhas.splice(pos, 0, linha);
  return linhas.join("\n").trim().slice(0, 2000);
}

/**
 * O paciente desiste do pedido em andamento e pede outra coisa ("vou deixar a
 * dermatologia para depois, quero nutricionista"), ou corrige o exame do pedido
 * ("confundi os pedidos, o meu é Doppler venoso"): a transferência pendente do
 * pedido antigo não vale mais.
 *
 * Trocar só o profissional ou o dia ("pode seguir com o Milton em vez da
 * Raisa", "me confundi nos nomes") continua o mesmo pedido.
 */
export function trocaDeAssunto(mensagem: string): boolean {
  const t = chave(mensagem);
  return (
    /\b(?:deixar|deixa|vou deixar|deixo)\b[^.!?\n]{0,40}\b(?:para|pra) depois\b|\bmudei de ideia\b|\bdesisti\b|\bnao quero mais\b|\b(?:em vez|ao inves) d[eoa]s? (?:consulta|exame|procedimento|especialidade)\b|\bpensando melhor\b[^.!?\n]{0,40}\b(?:quero|prefiro|vou) (?:ver|consultar|marcar|comecar|agendar)\b/.test(
      t,
    ) ||
    // Correção do exame/pedido (homologação 14/10/2026, ciclo 1201).
    /\b(?:me )?(?:confundi|enganei|errei|troquei)\b[^.!?\n]{0,30}\b(?:pedidos?|exames?|papel|papeis|guias?)\b|\b(?:pedidos?|exames?|papel|papeis|guias?)\b[^.!?\n]{0,20}\b(?:confundi|errad[oa]s?|trocad[oa]s?)\b|\bnao e (?:ess[ea]|est[ea]) (?:exame|pedido|procedimento)\b/.test(
      t,
    )
  );
}
