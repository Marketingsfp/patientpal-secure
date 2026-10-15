/**
 * Dados do paciente antes da transferência para a equipe (regra de 12/10/2026).
 *
 *  - Toda transferência pede, uma única vez, nome completo e data de nascimento,
 *    para a atendente já receber o paciente identificado.
 *  - Exceções (transfere na hora, sem pedir): urgência, reclamação, pedido
 *    explícito por uma pessoa e encaminhamento silencioso.
 *  - Na mensagem seguinte a transferência acontece com o que o paciente enviou;
 *    o que faltar fica "não informado" no resumo. Nunca trava o atendimento.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";
import { separarOrientacaoRecepcao } from "./informacao-nao-cadastrada";
import { afirmaEncaminhamento } from "./fluxo-agendamento-item";

export const PERGUNTA_DADOS_TRANSFERENCIA =
  "Vou encaminhar você para a nossa equipe. Para agilizar o seu atendimento, me envie, por favor, o seu nome completo e a sua data de nascimento.";

/**
 * Regra de 13/10/2026: com a transferência aguardando os dados, o paciente
 * pergunta algo em vez de mandá-los ("Antes de passar meus dados, preciso
 * saber quanto custa"). A Nina responde com o cadastro e transfere na mesma
 * mensagem, sem pedir os dados de novo.
 */
export function perguntaEmVezDosDados(mensagem: string): boolean {
  const dados = extrairDadosTransferencia(mensagem);
  if (dados.nome_completo || dados.data_nascimento) return false;
  if ((mensagem ?? "").includes("?")) return true;
  return /\b(?:preciso saber|queria saber|quero saber|gostaria de saber|me (?:diga|fala|informe)|quanto (?:custa|e|fica)|qual (?:o|a) (?:valor|preco)|voces (?:fazem|atendem|tem))\b/.test(
    normalizarRespostaInformal(mensagem ?? ""),
  );
}

/**
 * A mensagem que escolhe também pergunta algo ("quinta com a Eneida, no débito
 * é 150?", "sábado cedo, é por ordem de chegada?"): a Nina responde primeiro e
 * pede os dados na mesma mensagem (homologação 15/10/2026, ~60 ciclos em que a
 * pergunta ficava sem resposta).
 */
export function perguntaJuntoDaEscolha(mensagem: string): boolean {
  if ((mensagem ?? "").includes("?")) return true;
  return /\b(?:quanto (?:custa|e|fica)|qual (?:o |a )?(?:valor|preco|horario|dia)|que (?:dia|dias|horas)|precisa (?:de |marcar|agendar|levar|jejum|pedido|chegar)|aceita[m]?|(?:no|pelo|e no|e) (?:debito|credito)\w* (?:tb|tambem|tbm|pode|e|fica|da)|(?:debito|credito)\w* (?:tb|tambem|tbm|pode la|na hora|la)|e por (?:ordem|chegada|hora)|e (?:chegada|hora marcada)|tem (?:jejum|preparo|estacionamento)|pago (?:la|na hora|no dia)|posso (?:pagar|levar|ir|chegar))\b/.test(
    normalizarRespostaInformal(mensagem ?? ""),
  );
}

export const INSTRUCAO_RESPONDER_E_ENCAMINHAR =
  "O paciente escolheu o atendimento e, na mesma mensagem, fez uma pergunta. Responda somente a pergunta, com o que o cadastro traz (débito e crédito à vista têm o valor de Pix/cartão). Não peça nome nem data de nascimento, não pergunte nada no final e não diga que vai encaminhar: o sistema pede os dados logo depois da sua resposta.";

export const REGRA_RESPONDER_ANTES_DA_TRANSFERENCIA = `TRANSFERENCIA AGUARDANDO DADOS — REGRA INEGOCIAVEL:
- A transferencia para a equipe ja foi pedida. O paciente fez uma pergunta em vez de enviar nome e data de nascimento.
- Responda somente a pergunta, com o que o cadastro traz. Nao peca nome nem data de nascimento de novo, nao pergunte nada no final e nao diga que vai encaminhar: o sistema transfere logo depois da sua resposta.`;

/**
 * A resposta da IA pede nome completo e data de nascimento do paciente
 * ("vou solicitar que informe seu nome completo e sua data de nascimento").
 */
export function pedeDadosDoPaciente(texto: string): boolean {
  const t = normalizarRespostaInformal(texto ?? "");
  return (
    /\bnome completo\b/.test(t) &&
    /\b(?:data de nascimento|nascimento|data de nasc)\b/.test(t) &&
    /\b(?:envie|enviar|informe|informar|informa|passe|passar|mande|mandar|preciso|precisamos|solicitar|solicito|poderia|pode me|me diga|por gentileza|por favor)\b/.test(
      t,
    )
  );
}

/**
 * O que segue junto da transferência: a resposta da IA sem perguntas finais,
 * convites, orientação de procurar a recepção, promessa de encaminhar ou novo
 * pedido de dados.
 */
export function respostaAntesDaTransferencia(texto: string): string {
  const { restante } = separarOrientacaoRecepcao(texto ?? "", false);
  const PONTO = String.fromCharCode(30);
  const protegido = restante.replace(/\b(?:dra?|sra?|profa?)\./gi, (m) => m.slice(0, -1) + PONTO);
  return protegido
    .split("\n")
    .map((linha) =>
      (linha.match(/[^.!?\n]+[.!?]*/g) ?? [])
        .filter((frase) => {
          const f = frase.split(PONTO).join(".");
          return (
            !afirmaEncaminhamento(f) &&
            !/\b(?:nome completo|data de nascimento|encaminh\w*|transfer\w*)\b/.test(
              normalizarRespostaInformal(f),
            )
          );
        })
        .join("")
        .trim(),
    )
    .join("\n")
    .split(PONTO)
    .join(".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Argumentos da ferramenta de transferência guardados até o paciente responder. */
export type ArgumentosTransferencia = {
  motivo: string;
  resumo?: string | null;
  urgencia?: string | null;
  setor?: string | null;
};

export type TransferenciaPendente = {
  session_id: string;
  em: string;
  argumentos: ArgumentosTransferencia;
};

export type DadosPacienteTransferencia = {
  nome_completo: string | null;
  data_nascimento: string | null;
};

/** Transferências que não esperam os dados do paciente. */
export function transferenciaDispensaDados(p: {
  urgencia?: string | null;
  motivo?: string | null;
  avisarPaciente?: boolean;
  pedidoExplicitoAtendente?: boolean;
}): boolean {
  if (p.urgencia === "alta" || p.avisarPaciente === false || p.pedidoExplicitoAtendente)
    return true;
  // Pedido médico não enviado: a equipe assume direto (regra de 15/10/2026).
  if (/^\s*(?:\[[^\]]*\]\s*)?PEDIDO_MEDICO_NAO_ENVIADO\b/.test(p.motivo ?? "")) return true;
  const motivo = normalizarRespostaInformal(p.motivo ?? "");
  return /urgen|emergen|reclama|(?:solicitou|pediu|quer|deseja|pedido explicito (?:de|por)|pedido (?:de|por)) (?:falar com |um |uma |o |a )?(?:atendente|humano|pessoa|atendimento humano)|falar com (?:um |uma )?(?:atendente|humano|pessoa)/.test(
    motivo,
  );
}

export function normalizarTransferenciaPendente(v: unknown): TransferenciaPendente | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a = o.argumentos as Record<string, unknown> | undefined;
  if (typeof o.session_id !== "string" || typeof o.em !== "string" || !a) return null;
  if (typeof a.motivo !== "string" || !a.motivo.trim()) return null;
  const texto = (x: unknown, max: number) =>
    typeof x === "string" && x.trim() ? x.slice(0, max) : null;
  return {
    session_id: o.session_id,
    em: o.em,
    argumentos: {
      motivo: a.motivo.slice(0, 500),
      resumo: texto(a.resumo, 2000),
      urgencia: texto(a.urgencia, 20),
      setor: texto(a.setor, 120),
    },
  };
}

const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const DATA_NUMERICA = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/;
const DATA_COMPACTA = /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/;
/** "dia 5 mes 6 ano 1987", "dia7 do6 de1988", "7 do 8 de 1984" (homologação 15/10/2026). */
const DATA_PARTES =
  /(?:\bdia\s*)?(?<!\d)(\d{1,2})\s*,?\s*(?:do\s+mes|mes|do|de)\s*(\d{1,2})\s*,?\s*(?:do\s+ano|ano|de|do)\s*(\d{4})(?!\d)/;
const DATA_EXTENSO = new RegExp(
  `\\b(\\d{1,2})\\s*(?:de\\s+)?(${MESES.join("|")})\\s*(?:de\\s+)?(\\d{4})\\b`,
);
/** "05 jan 1983", "5 de fev. de 1990", "05/jan/1983" (homologação 14/10/2026). */
const DATA_ABREVIADA = new RegExp(
  `\\b(\\d{1,2})\\s*(?:de\\s+|[/.-]\\s*)?(${MESES.map((m) => m.slice(0, 3)).join("|")})\\.?\\s*(?:de\\s+|[/.-]\\s*)?(\\d{4})\\b`,
);

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dataValida(dia: number, mes: number, ano: number, hoje: Date): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || ano < 1900) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  if (d.getTime() > hoje.getTime()) return null;
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

/** Data de nascimento em dd/mm/aaaa, ou null; devolve também o trecho lido. */
function lerData(texto: string, hoje: Date): { data: string; trecho: string } | null {
  const t = semAcento(texto.toLowerCase());
  const numerica = DATA_NUMERICA.exec(t);
  if (numerica) {
    let ano = Number(numerica[3]);
    if (numerica[3]!.length === 2) {
      const seculo = ano > hoje.getUTCFullYear() % 100 ? 1900 : 2000;
      ano += seculo;
    }
    const data = dataValida(Number(numerica[1]), Number(numerica[2]), ano, hoje);
    if (data) return { data, trecho: numerica[0] };
  }
  const extenso = DATA_EXTENSO.exec(t);
  if (extenso) {
    const mes = MESES.indexOf(extenso[2]!) + 1;
    const data = dataValida(Number(extenso[1]), mes, Number(extenso[3]), hoje);
    if (data) return { data, trecho: extenso[0] };
  }
  const abreviada = DATA_ABREVIADA.exec(t);
  if (abreviada) {
    const mes = MESES.findIndex((m) => m.startsWith(abreviada[2]!)) + 1;
    const data = dataValida(Number(abreviada[1]), mes, Number(abreviada[3]), hoje);
    if (data) return { data, trecho: abreviada[0] };
  }
  const compacta = DATA_COMPACTA.exec(t);
  if (compacta) {
    const data = dataValida(Number(compacta[1]), Number(compacta[2]), Number(compacta[3]), hoje);
    if (data) return { data, trecho: compacta[0] };
  }
  const partes = DATA_PARTES.exec(t);
  if (partes) {
    const data = dataValida(Number(partes[1]), Number(partes[2]), Number(partes[3]), hoje);
    if (data) return { data, trecho: partes[0] };
  }
  return null;
}

const NAO_NOME =
  /\b(?:sim|nao|pode|podem|por favor|favor|obrigad[oa]|quero|queria|gostaria|consulta|exame|agendar|marcar|transfer\w*|encaminh\w*|ok|oi|ola|bom dia|boa tarde|boa noite|tudo bem|valeu|beleza|certo|claro|doutor\w*|dra?|medic\w*|horario|sabado|domingo|amanha|hoje|ta bom|esta bom|ta certo|tudo certo|entendi|perfeito|combinado|pronto|segue|seguem|meus dados|dados)\b/;
const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);

function tituloDoNome(nome: string): string {
  return nome
    .split(/\s+/)
    .map((p) => {
      const baixo = p.toLocaleLowerCase("pt-BR");
      return CONECTORES.has(semAcento(baixo))
        ? baixo
        : baixo.charAt(0).toLocaleUpperCase("pt-BR") + baixo.slice(1);
    })
    .join(" ");
}

/** Minúsculas sem acento, com o MESMO tamanho do texto (os índices batem). */
function chaveMesmoTamanho(t: string): string {
  return Array.from(t, (c) => {
    const base = c.normalize("NFD").charAt(0).toLowerCase();
    return base.length === c.length ? base : c.toLowerCase();
  }).join("");
}

const PARENTES =
  "filho|filha|pai|mae|avo|avoa|tia|tio|irma|irmao|marido|esposa|esposo|sobrinho|sobrinha|neto|neta|bebe|enteado|enteada|sogro|sogra|primo|prima|companheiro|companheira";

/**
 * "paciente Fulano" sem o parentesco: só no meio da frase e escrito em
 * minúscula ("mas paciente…", "sou filho Caio. paciente…"). "Paciente" com
 * maiúscula é nome (os nomes fictícios "Paciente Teste…"), e nunca depois de
 * "meu nome é" nem no início do texto.
 */
const ROTULO_PACIENTE_SOLTO = new RegExp(
  String.raw`(?<!\b(?:nome(?: completo)?(?: e)?|chamo|sou(?: o| a)?)\s)(?<=[a-z,.]\s)\bpaciente\s+(?:e\s+)?[,:-]?\s*`,
  "g",
);

/** Rótulos que apresentam o PACIENTE quando quem escreve é outra pessoa. */
const ROTULOS_PACIENTE: RegExp[] = [
  /\bnome (?:completo )?d[oa] (?:paciente|bebe|crianca)\s*(?:e\b|:|-)?\s*/g,
  new RegExp(
    String.raw`\b(?:o|a) paciente (?:e|se chama)\s+(?:(?:o|a)\s+)?(?:(?:meu|minha)\s+(?:${PARENTES})\b\s*[,:]?\s*)?`,
    "g",
  ),
  /\bpaciente\s*:\s*/g,
  /\bnome (?:dele|dela)\s*(?:e\b|:|-)?\s*/g,
  /\b(?:ele|ela|o menino|a menina|o bebe|a bebe|a crianca) se chama\s+/g,
  new RegExp(
    String.raw`\b(?:meu|minha)\s+(?:${PARENTES})\s*(?:se chama\b|chama\b|e\b|[,:-])\s*`,
    "g",
  ),
  // Homologação 15/10/2026 (ciclos 1248–1424): "é pro meu pai Fulano",
  // "paciente minha irmã Fulana", "paciente é meu filho Fulano", "minha mãe
  // paciente Fulana", "é o meu marido Fulano", "o dele Fulano".
  new RegExp(
    String.raw`\b(?:pro|pra|para o|para a|p/)\s+(?:o\s+|a\s+)?(?:meu|minha)\s+(?:${PARENTES})\b\s*[,:-]?\s*`,
    "g",
  ),
  // "paciente minha irmã Fulana", "paciente é meu filho Fulano", "paciente esposa Fulana".
  new RegExp(
    String.raw`(?<!\b(?:nome(?: completo)?(?: e)?|chamo)\s)\bpaciente\s+(?:e\s+)?(?:(?:o|a)\s+)?(?:(?:meu|minha)\s+)?(?:${PARENTES})\b\s*[,:-]?\s*`,
    "g",
  ),
  ROTULO_PACIENTE_SOLTO,
  new RegExp(String.raw`\b(?:meu|minha)\s+(?:${PARENTES})\s+paciente\s*[,:-]?\s*`, "g"),
  new RegExp(String.raw`\b(?:e\s+)?(?:o|a)\s+(?:meu|minha)\s+(?:${PARENTES})\b\s*[,:-]?\s*`, "g"),
  /\b(?:o|a)\s+(?:dele|dela)\s*(?:e\b|:)?\s*/g,
];
/** "ela Fulana Cardoso, nascimento: …": só com o nome começando em maiúscula. */
const ROTULOS_PACIENTE_MAIUSCULA: RegExp[] = [
  /\b(?:ele|ela|o menino|a menina|o bebe|a bebe|a crianca)\s+/g,
];
/** Rótulos de quem escreve falando de si. */
const ROTULOS_PROPRIO: RegExp[] = [
  // "meu nome Fulano, nasci…" também vale, sem o "é" (ciclos 1235–1261).
  /\bmeu nome (?:completo )?(?:e\b|:)?\s*:?\s*/g,
  /\b(?:eu )?me chamo\s+/g,
  /\bnome(?: completo)?\s*:\s*/g,
];
/** "Sou o Ricardo…", "Sou Rosana…": só com o nome começando em maiúscula. */
const ROTULO_SOU = /\bsou\s+(?:(?:o|a)\s+)?/g;

/** Palavras que encerram o nome quando aparecem depois dele. */
const PARADAS = new Set([
  "nasc",
  "dn",
  "nasci",
  "nasceu",
  "nascida",
  "nascido",
  "data",
  "tenho",
  "tem",
  "sou",
  "quero",
  "pode",
  "podem",
  "vou",
  "vai",
  "moro",
  "mora",
  "com",
  "para",
  "pra",
  "na",
  "no",
  "nas",
  "nos",
  "em",
  "que",
  "esse",
  "esses",
  "este",
  "estes",
  "isso",
  "ele",
  "ela",
  "a",
  "o",
  "os",
  "as",
]);
/** Palavras que nunca fazem parte de um nome de pessoa. */
const NUNCA_NOME = new Set([
  ...PARENTES.split("|"),
  "paciente",
  "dr",
  "dra",
  "doutor",
  "doutora",
  "medico",
  "medica",
  "consulta",
  "exame",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
  "manha",
  "tarde",
  "noite",
  "hoje",
  "amanha",
  "horario",
  "valor",
  "sim",
  "nao",
  "obrigado",
  "obrigada",
  "ok",
  "oi",
  "ola",
  "quero",
  "vou",
  "pensando",
  "melhor",
  "verdade",
  "informei",
  "tinha",
  "passado",
  "opcao",
  "opcoes",
  "quais",
  "voce",
  "voces",
  "lista",
  "apresentou",
  "escolher",
  "escolho",
  "seguir",
  "fica",
  "ficar",
  "bom",
  "boa",
  "dia",
  "dados",
  "lead",
  "meu",
  "minha",
  "data",
  "nasci",
  "nasceu",
  "nascida",
  "nascido",
  "nasc",
  // Frases e termos que viravam nome no resumo (homologação 15/10/2026:
  // "Eu Q To Falando", "Qnt Custa", "Levo Pedido", "Rm de Joelho"…).
  "eu",
  "q",
  "to",
  "ta",
  "tava",
  "esta",
  "estou",
  "so",
  "mesmo",
  "msm",
  "vendo",
  "falando",
  "qnt",
  "qto",
  "quanto",
  "custa",
  "valor",
  "levo",
  "levar",
  "pedido",
  "receita",
  "original",
  "papel",
  "precisa",
  "preciso",
  "quer",
  "queria",
  "faz",
  "fazer",
  "tem",
  "rm",
  "rx",
  "tc",
  "usg",
  "tsh",
  "ecg",
  "eeg",
  "exames",
  "ultrassonografia",
  "ultrassom",
  "joelho",
  "debito",
  "credito",
  "dinheiro",
  "pix",
  "cartao",
  "menino",
  "menina",
  "crianca",
]);

function palavrasValidas(palavras: string[], permitirPaciente = false): boolean {
  if (palavras.length < 2 || palavras.length > 8) return false;
  if (!palavras.every((p) => /^[\p{L}'´`-]+$/u.test(p))) return false;
  const chaves = palavras.map((p) => semAcento(p.toLowerCase()));
  const significativas = chaves.filter((p) => p.length >= 2 && !CONECTORES.has(p));
  if (significativas.length < 2) return false;
  if (chaves.some((p) => NUNCA_NOME.has(p) && !(permitirPaciente && p === "paciente")))
    return false;
  return !NAO_NOME.test(chaves.join(" "));
}

function aparaConectores(palavras: string[]): string[] {
  const r = [...palavras];
  while (r.length && CONECTORES.has(semAcento(r.at(-1)!.toLowerCase()))) r.pop();
  while (r.length && CONECTORES.has(semAcento(r[0]!.toLowerCase()))) r.shift();
  return r;
}

/** Lê o nome que começa em `inicio`, até pontuação, número ou palavra de parada. */
function nomeAPartirDe(texto: string, inicio: number, exigirMaiuscula = false): string | null {
  // "o paciente é meu pai: nome joão…" — o rótulo "nome" não é parte do nome
  // (homologação 14/10/2026, ciclo 1204).
  const resto = texto
    .slice(inicio, inicio + 160)
    .replace(
      /^[\s:–-]*(?:(?:o|seu|meu|sua|minha)\s+)?nome(?:\s+completo)?(?:\s+(?:dele|dela))?\s*(?:[:–-]|\b(?:é|e)\b)?\s*/iu,
      "",
    );
  const achados = [...resto.matchAll(/[\p{L}'´`-]+|\d+|[^\s\p{L}\d'´`-]/gu)];
  const tokens = achados.map((m) => m[0]);
  const palavras: string[] = [];
  for (let i = 0; i < tokens.length && palavras.length < 9; i++) {
    const tok = tokens[i]!;
    if (!/^[\p{L}'´`-]+$/u.test(tok)) break;
    const k = semAcento(tok.toLowerCase());
    if (!palavras.length && (k === "o" || k === "a")) continue;
    if (k === "e") {
      const prox = tokens[i + 1] ?? "";
      if (/^\p{Lu}/u.test(prox) && !PARADAS.has(semAcento(prox.toLowerCase()))) {
        palavras.push(tok);
        continue;
      }
      break;
    }
    // "Nascimento" é sobrenome; só é rótulo quando vem ":" , "em" ou a data depois.
    if (k === "nascimento") {
      const depois = resto.slice(achados[i]!.index! + tok.length);
      if (/^\s*(?::|-|em\b|\d|de\s+\d)/i.test(depois) || !/^\p{Lu}/u.test(tok)) break;
    }
    if (PARADAS.has(k) && !CONECTORES.has(k)) break;
    palavras.push(tok);
  }
  const nome = aparaConectores(palavras);
  if (exigirMaiuscula && !/^\p{Lu}/u.test(nome[0] ?? "")) return null;
  return palavrasValidas(nome, true) ? tituloDoNome(nome.join(" ")) : null;
}

/** Primeiro nome válido depois de um dos rótulos. */
function nomeRotulado(
  original: string,
  chave: string,
  rotulos: RegExp[],
  exigirMaiuscula = false,
): string | null {
  for (const rotulo of rotulos) {
    for (const m of chave.matchAll(rotulo)) {
      if (rotulo === ROTULO_PACIENTE_SOLTO && original[m.index!] !== "p") continue;
      const nome = nomeAPartirDe(original, m.index! + m[0].length, exigirMaiuscula);
      if (nome) return nome;
    }
  }
  return null;
}

export type DadosLidosTransferencia = DadosPacienteTransferencia & {
  /** Quem escreveu, quando não é o paciente ("eu sou a mãe, …"). */
  responsavel?: string | null;
};

/**
 * Lê nome completo e data de nascimento do PACIENTE na mensagem (homologação
 * 13–14/10/2026): primeiro os rótulos que apresentam o paciente ("nome dele:",
 * "a paciente é minha filha …", "meu pai se chama …"), depois os de quem
 * escreve ("meu nome é", "me chamo", "nome:", "sou o …"), e só então um
 * trecho solto que pareça nome (iniciais maiúsculas ou junto da data).
 * Frases, dias, períodos, nomes com "Dr." e palavras como "pensando melhor"
 * nunca viram nome. "Nascimento" como sobrenome fica no nome. O que não for
 * reconhecido com segurança fica null.
 */
export function extrairDadosTransferencia(
  texto: string,
  hoje: Date = new Date(),
): DadosLidosTransferencia {
  const bruto = String(texto ?? "").slice(0, 600);
  const lida = lerData(bruto, hoje);
  // A data sai do texto para não colar no nome; os índices continuam valendo.
  let base = bruto;
  if (lida) {
    const inicio = chaveMesmoTamanho(base).indexOf(lida.trecho);
    if (inicio >= 0)
      base = `${base.slice(0, inicio)}${"\n".padEnd(lida.trecho.length, " ")}${base.slice(inicio + lida.trecho.length)}`;
  }
  const chave = chaveMesmoTamanho(base);
  const doPaciente =
    nomeRotulado(base, chave, ROTULOS_PACIENTE) ??
    nomeRotulado(base, chave, ROTULOS_PACIENTE_MAIUSCULA, true);
  const proprio =
    nomeRotulado(base, chave, ROTULOS_PROPRIO) ?? nomeRotulado(base, chave, [ROTULO_SOU], true);
  let nome = doPaciente ?? proprio;
  const responsavel = doPaciente && proprio && proprio !== doPaciente ? proprio : null;

  if (!nome) {
    // Trecho solto: "Paciente Teste da Silva, 01/02/1990", "LEONOR MARTINS REIS, 29/05/1943".
    // "Dr. Fulano" fica junto da palavra "Dr" e é recusado.
    const semAbrev = base.replace(/\b(dra?|sra?|profa?)\./gi, "$1 ");
    for (const trecho of semAbrev.split(/[\n,;:|()]+|[.!?](?:\s+|$)|\s+-\s+/)) {
      // "Fulana de Tal nasc …": o rótulo da data no fim não faz parte do nome.
      const semRotuloData = trecho
        .replace(/["“”]/g, " ")
        .replace(/\s+(?:nasc(?:eu|ida|ido)?|dn)\s*[:,-]?\s*$/i, "")
        .trim();
      const palavras = aparaConectores(semRotuloData.split(/\s+/));
      if (!palavrasValidas(palavras, true)) continue;
      const significativas = palavras.filter((p) => !CONECTORES.has(semAcento(p.toLowerCase())));
      const maiusculas =
        significativas.every((p) => /^\p{Lu}/u.test(p)) ||
        palavras.join(" ") === palavras.join(" ").toLocaleUpperCase("pt-BR");
      if (!maiusculas) continue;
      nome = tituloDoNome(palavras.join(" "));
      break;
    }
  }
  if (!nome && lida) {
    // Nome em minúsculas logo antes da data, na mesma linha: "joao da silva 12/03/1980".
    const inicio = chaveMesmoTamanho(bruto).indexOf(lida.trecho);
    const linha = bruto.slice(0, Math.max(inicio, 0)).split("\n").at(-1) ?? "";
    const antes = linha
      .replace(
        /(?:,|-|\s)*(?:nasci(?:do|da)?(?: em)?|nasc(?:eu)?(?: em)?|data de nascimento|nascimento|dn)?\s*[:,-]?\s*$/i,
        "",
      )
      .trim();
    const palavras = aparaConectores(antes.split(/\s+/).filter(Boolean));
    if (palavrasValidas(palavras, true)) nome = tituloDoNome(palavras.join(" "));
  }
  return {
    nome_completo: nome,
    data_nascimento: lida?.data ?? null,
    ...(responsavel ? { responsavel } : {}),
  };
}

/**
 * Nome e data já enviados na conversa (mensagens do paciente, da mais recente
 * para a mais antiga): o que faltar numa mensagem pode estar em outra.
 */
export function dadosDaConversa(
  mensagens: readonly string[],
  hoje: Date = new Date(),
): DadosLidosTransferencia {
  let nome: string | null = null;
  let data: string | null = null;
  let responsavel: string | null = null;
  // A mensagem que traz nome E data juntos é a dos dados: vale antes de um
  // "nome" lido de outra mensagem da conversa (homologação 15/10/2026).
  for (const m of mensagens) {
    const d = extrairDadosTransferencia(m, hoje);
    if (d.nome_completo && d.data_nascimento)
      return {
        nome_completo: d.nome_completo,
        data_nascimento: d.data_nascimento,
        ...(d.responsavel ? { responsavel: d.responsavel } : {}),
      };
  }
  for (const m of mensagens) {
    const d = extrairDadosTransferencia(m, hoje);
    if (!nome && d.nome_completo) {
      nome = d.nome_completo;
      responsavel = d.responsavel ?? null;
    }
    data ??= d.data_nascimento;
    if (nome && data) break;
  }
  return {
    nome_completo: nome,
    data_nascimento: data,
    ...(responsavel ? { responsavel } : {}),
  };
}

/** Linhas para o resumo da transferência; o que faltar aparece como não informado. */
export function linhasDadosPaciente(dados: DadosLidosTransferencia): string[] {
  return [
    `Nome completo: ${dados.nome_completo ?? "não informado"}`,
    `Data de nascimento: ${dados.data_nascimento ?? "não informada"}`,
    ...(dados.responsavel ? [`Responsável que fez o contato: ${dados.responsavel}`] : []),
  ];
}

/** Argumentos da transferência retomada: os dados entram no início do resumo e em campo próprio. */
export function argumentosComDados(
  a: ArgumentosTransferencia,
  dados: DadosLidosTransferencia,
): ArgumentosTransferencia & { urgencia: string; dados_paciente: DadosPacienteTransferencia } {
  return {
    motivo: a.motivo,
    resumo: [...linhasDadosPaciente(dados), a.resumo].filter(Boolean).join("\n").slice(0, 2000),
    urgencia: a.urgencia ?? "normal",
    ...(a.setor ? { setor: a.setor } : {}),
    dados_paciente: { nome_completo: dados.nome_completo, data_nascimento: dados.data_nascimento },
  };
}

export function normalizarDadosPaciente(v: unknown): DadosPacienteTransferencia | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const nome = typeof o.nome_completo === "string" ? o.nome_completo.trim().slice(0, 120) : "";
  const data =
    typeof o.data_nascimento === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(o.data_nascimento)
      ? o.data_nascimento
      : "";
  if (!("nome_completo" in o) && !("data_nascimento" in o)) return null;
  return { nome_completo: nome || null, data_nascimento: data || null };
}
