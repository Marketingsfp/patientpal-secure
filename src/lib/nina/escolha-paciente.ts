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

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e"]);
const TITULOS = new Set(["dr", "dra", "doutor", "doutora", "prof", "profa"]);

const chave = (t: string) => normalizarRespostaInformal(t ?? "").replace(/[?]/g, " ");

function partesDoNome(nome: string): string[] {
  return chave(nome)
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !CONECTORES.has(p) && !TITULOS.has(p));
}

/**
 * Profissionais citados pelo nome na mensagem. Com mais de um candidato, fica o
 * que tem mais partes do nome citadas ("Carlos Eduardo" → Carlos Eduardo, não
 * Carlos Alberto). Empate continua empatado.
 */
export function profissionaisCitados(texto: string, nomes: readonly string[]): string[] {
  const t = ` ${chave(texto)} `;
  const pontos = nomes.map((nome) => {
    const partes = partesDoNome(nome);
    return { nome, n: partes.filter((p) => t.includes(` ${p} `)).length };
  });
  const melhor = Math.max(0, ...pontos.map((p) => p.n));
  if (!melhor) return [];
  return [...new Set(pontos.filter((p) => p.n === melhor).map((p) => p.nome))];
}

const DIAS: [RegExp, string][] = [
  // "essa segunda opção" não é dia.
  [/\bsegunda(?:[- ]feira)?\b(?! (?:opcao|vez|via|alternativa|op))/, "segunda-feira"],
  [/\bterca(?:[- ]feira)?\b/, "terça-feira"],
  [/\bquarta(?:[- ]feira)?\b/, "quarta-feira"],
  [/\bquinta(?:[- ]feira)?\b/, "quinta-feira"],
  [/\bsexta(?:[- ]feira)?\b/, "sexta-feira"],
  [/\bsabado\b/, "sábado"],
  [/\bdomingo\b/, "domingo"],
  [/\bamanha\b/, "amanhã"],
];

function diaDe(t: string): string | null {
  for (const [re, dia] of DIAS) if (re.test(t)) return dia;
  return null;
}

function periodoDe(t: string): string | null {
  if (/\b(?:de |pela |na |a )?manha\b/.test(t)) return "manhã";
  if (/\b(?:de |pela |na |a )?tarde\b/.test(t)) return "tarde";
  if (/\b(?:de |pela |na |a )?noite\b/.test(t)) return "noite";
  const hora = /\b(?:as |a partir das )?(\d{1,2})(?:h|:\d{2}| horas)\b/.exec(t);
  return hora ? `${hora[1]}h` : null;
}

function pagamentoDe(t: string): string | null {
  if (/\bpix\b/.test(t)) return "Pix";
  if (/\bdebito\b/.test(t)) return "cartão de débito";
  if (/\bcredito\b/.test(t)) return "cartão de crédito";
  if (/\bcartao\b/.test(t) && !/\bcartao (?:de )?(?:consulta|beneficio|desconto)/.test(t))
    return "cartão";
  if (/\bdinheiro\b/.test(t)) return "dinheiro";
  return null;
}

export type EscolhaPaciente = {
  profissional: string | null;
  dia: string | null;
  periodo: string | null;
  pagamento: string | null;
};

/**
 * Escolha mais recente: profissional, dia e período saem da mensagem mais
 * recente que cita profissional ou dia (a troca vale sobre a escolha antiga);
 * o que faltar nela vem da mensagem anterior mais próxima. A forma de pagamento
 * é a última citada.
 */
export function escolhaNaConversa(
  textos: readonly string[],
  nomes: readonly string[],
): EscolhaPaciente {
  const lidas = textos.map((texto) => {
    const t = chave(texto);
    // O nome do próprio paciente ("meu nome é Marina…") não é escolha de profissional.
    const semNomeDoPaciente = texto.replace(
      /(?:meu nome(?: completo)? (?:é|e)|me chamo|nome(?: completo)?\s*:|paciente\s*:|nome d(?:ele|ela)(?: (?:é|e))?\s*:?|se chama)[^.,;\n]*/gi,
      " ",
    );
    const citados = profissionaisCitados(semNomeDoPaciente, nomes);
    return {
      profissional: citados.length === 1 ? citados[0]! : null,
      dia: diaDe(t),
      periodo: periodoDe(t),
      pagamento: pagamentoDe(t),
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
 * dermatologia para depois, quero nutricionista"): a transferência pendente do
 * pedido antigo não vale mais.
 */
export function trocaDeAssunto(mensagem: string): boolean {
  const t = chave(mensagem);
  return /\b(?:deixar|deixa|vou deixar|deixo)\b[^.!?\n]{0,40}\b(?:para|pra) depois\b|\bmudei de ideia\b|\bdesisti\b|\bnao quero mais\b|\b(?:em vez|ao inves) d[eoa]\b|\bpensando melhor\b[^.!?\n]{0,40}\b(?:quero|prefiro|vou) (?:ver|consultar|marcar|comecar|agendar)\b/.test(
    t,
  );
}
