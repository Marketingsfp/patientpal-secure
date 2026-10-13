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

export const PERGUNTA_DADOS_TRANSFERENCIA =
  "Vou encaminhar você para a nossa equipe. Para agilizar o seu atendimento, me envie, por favor, o seu nome completo e a sua data de nascimento.";

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
const DATA_EXTENSO = new RegExp(
  `\\b(\\d{1,2})\\s*(?:de\\s+)?(${MESES.join("|")})\\s*(?:de\\s+)?(\\d{4})\\b`,
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
  const compacta = DATA_COMPACTA.exec(t);
  if (compacta) {
    const data = dataValida(Number(compacta[1]), Number(compacta[2]), Number(compacta[3]), hoje);
    if (data) return { data, trecho: compacta[0] };
  }
  return null;
}

const ROTULOS =
  /\b(?:meu nome completo e|meu nome e|nome completo|nome|me chamo|eu me chamo|eu sou|sou|data de nascimento|data nascimento|nascimento|nascida em|nascido em|nasci em|nasci no dia|nasci dia|nasci|nasc|dn)\b\s*[:=-]?/g;
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

/**
 * Lê nome completo (duas palavras ou mais, só letras) e data de nascimento da
 * resposta do paciente. O que não for reconhecido com segurança fica null.
 */
export function extrairDadosTransferencia(
  texto: string,
  hoje: Date = new Date(),
): DadosPacienteTransferencia {
  const bruto = String(texto ?? "").slice(0, 600);
  const lida = lerData(bruto, hoje);
  // Os rótulos são procurados sem acento, mas o nome é devolvido como escrito.
  let base = bruto;
  if (lida) {
    const inicio = semAcento(base.toLowerCase()).indexOf(lida.trecho);
    if (inicio >= 0) base = `${base.slice(0, inicio)}\n${base.slice(inicio + lida.trecho.length)}`;
  }
  const semRotulos = (() => {
    const chave = semAcento(base.toLowerCase());
    let saida = "";
    let ultimo = 0;
    for (const m of chave.matchAll(ROTULOS)) {
      saida += `${base.slice(ultimo, m.index)}\n`;
      ultimo = m.index! + m[0].length;
    }
    return saida + base.slice(ultimo);
  })();
  let nome: string | null = null;
  // Frases separadas ("Tá bom. Meu nome é …") não se misturam no nome.
  for (const trecho of semRotulos.split(/[\n,;:|()]+|[.!?]\s+|\s+-\s+|\s+e\s+(?=\d)/)) {
    const candidato = trecho
      .replace(/[.!?"]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidato || candidato.length > 120) continue;
    const palavras = candidato.split(" ");
    // "… teste e [nasci em]": conector solto nas pontas não faz parte do nome.
    while (palavras.length && CONECTORES.has(semAcento(palavras.at(-1)!.toLowerCase())))
      palavras.pop();
    while (palavras.length && CONECTORES.has(semAcento(palavras[0]!.toLowerCase())))
      palavras.shift();
    if (palavras.length > 8) continue;
    if (!palavras.every((p) => /^[\p{L}'´`-]+$/u.test(p))) continue;
    const significativas = palavras.filter(
      (p) => p.length >= 2 && !CONECTORES.has(semAcento(p.toLowerCase())),
    );
    if (significativas.length < 2) continue;
    if (NAO_NOME.test(semAcento(palavras.join(" ").toLowerCase()))) continue;
    nome = tituloDoNome(palavras.join(" "));
    break;
  }
  return { nome_completo: nome, data_nascimento: lida?.data ?? null };
}

/** Linhas para o resumo da transferência; o que faltar aparece como não informado. */
export function linhasDadosPaciente(dados: DadosPacienteTransferencia): string[] {
  return [
    `Nome completo: ${dados.nome_completo ?? "não informado"}`,
    `Data de nascimento: ${dados.data_nascimento ?? "não informada"}`,
  ];
}

/** Argumentos da transferência retomada: os dados entram no início do resumo e em campo próprio. */
export function argumentosComDados(
  a: ArgumentosTransferencia,
  dados: DadosPacienteTransferencia,
): ArgumentosTransferencia & { urgencia: string; dados_paciente: DadosPacienteTransferencia } {
  return {
    motivo: a.motivo,
    resumo: [...linhasDadosPaciente(dados), a.resumo].filter(Boolean).join("\n").slice(0, 2000),
    urgencia: a.urgencia ?? "normal",
    ...(a.setor ? { setor: a.setor } : {}),
    dados_paciente: dados,
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
