/**
 * Próxima abertura da clínica — usada no aviso de transferência fora do
 * horário (regra de negócio de 11/10/2026): a Nina atende 24 horas e, fora do
 * funcionamento, informa quando a clínica abre e que a equipe atende nesse
 * horário; a transferência acontece na hora.
 *
 * Fonte de verdade do horário semanal: o prompt publicado da Nina (aba
 * Arquitetura), linha "Funcionamento habitual:" da unidade cujo "Nome:" é o da
 * clínica. Mudou o horário? Publique o prompt; o código não guarda horários.
 * Feriados e horários especiais vêm das exceções do calendário publicado na
 * Base de Conhecimentos. Dúvida => "desconhecida": nunca se inventa horário.
 */
import {
  calendarioAplicavel,
  FUSO_PADRAO,
  type CalendarioPublicado,
} from "./classificador-periodo";
import { diaDaSemanaISO, type FaixaDia } from "./horario-oficial";

/** Dia da semana (0 = domingo): faixas, "fechado" ou null (não informado). */
export type SemanaPrompt = Array<FaixaDia[] | "fechado" | null>;

export type AberturaPrevista = {
  /** AAAA-MM-DD no fuso da clínica. */
  data: string;
  /** HH:MM */
  hora: string;
  diaSemana: number;
  quando: "hoje" | "amanha" | "outro_dia";
};

export type SituacaoFuncionamento =
  | { situacao: "aberta" }
  | { situacao: "fora_do_horario"; abertura: AberturaPrevista }
  | { situacao: "desconhecida" };

const NOMES_DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const DIAS_PROMPT: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};
/** Dias percorridos à procura da abertura (cobre feriados prolongados). */
const HORIZONTE_DIAS = 14;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const nomeComparavel = (s: string) =>
  normalizar(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* Leitura do prompt publicado                                         */
/* ------------------------------------------------------------------ */

const FAIXA =
  /(\d{1,2})(?:h(\d{2})?|:(\d{2}))\s*(?:as|a|ate|-|–)\s*(\d{1,2})(?:h(\d{2})?|:(\d{2}))/g;

const hhmm = (h: string, m?: string) => `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;

function diasDoTrecho(trecho: string): number[] | null {
  const nomes = [...trecho.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/g)].map(
    (m) => DIAS_PROMPT[m[1]!]!,
  );
  if (!nomes.length) return null;
  // "segunda a sexta" = intervalo; "segunda, terça e quinta" = lista.
  if (nomes.length === 2 && /\b(?:a|ate)\b/.test(trecho.replace(/-feira/g, ""))) {
    const [ini, fim] = nomes as [number, number];
    const dias: number[] = [];
    for (let d = ini; ; d = (d + 1) % 7) {
      dias.push(d);
      if (d === fim) break;
    }
    return dias;
  }
  return nomes;
}

/** "segunda a sexta, das 07h às 18h; sábado, das 07h às 14h; domingo fechado." */
export function semanaDoTexto(funcionamento: string): SemanaPrompt | null {
  const semana: SemanaPrompt = [null, null, null, null, null, null, null];
  let algum = false;
  for (const parte of normalizar(funcionamento).split(";")) {
    const primeiraHora = parte.search(/\d/);
    const dias = diasDoTrecho(primeiraHora < 0 ? parte : parte.slice(0, primeiraHora));
    if (!dias) continue;
    const faixas = [...parte.matchAll(FAIXA)].map((m) => ({
      inicio: hhmm(m[1]!, m[2] ?? m[3]),
      fim: hhmm(m[4]!, m[5] ?? m[6]),
    }));
    const valor = faixas.length ? faixas : /\bfechad[oa]s?\b/.test(parte) ? "fechado" : null;
    if (!valor) return null; // trecho com dia mas sem horário reconhecível
    for (const d of dias) semana[d] = valor;
    algum = true;
  }
  return algum ? semana : null;
}

/**
 * Horário semanal da unidade no prompt publicado: a linha "Funcionamento
 * habitual:" do mesmo bloco REGRA cujo "Nome:" corresponde à clínica.
 */
export function semanaDaUnidadeNoPrompt(
  template: string,
  nomeClinica: string,
): SemanaPrompt | null {
  const alvo = nomeComparavel(nomeClinica);
  if (!template || !alvo) return null;
  let nomeAtual: string | null = null;
  const encontrados: SemanaPrompt[] = [];
  for (const linha of template.split(/\r?\n/)) {
    const t = linha.trim();
    if (/^REGRA\s/i.test(t)) nomeAtual = null;
    const nome = /^nome:\s*(.+)$/i.exec(t);
    if (nome) nomeAtual = nomeComparavel(nome[1]!);
    const func = /^funcionamento(?:\s+habitual)?:\s*(.+)$/i.exec(t);
    if (func && nomeAtual === alvo) {
      const semana = semanaDoTexto(func[1]!);
      if (!semana) return null;
      encontrados.push(semana);
    }
  }
  // Mais de um horário para a mesma unidade é conflito: não escolhe.
  return encontrados.length === 1 ? encontrados[0]! : null;
}

/* ------------------------------------------------------------------ */
/* Próxima abertura                                                    */
/* ------------------------------------------------------------------ */

const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function localAgora(agora: Date, fuso: string): { data: string; hora: string } {
  const data = agora.toLocaleDateString("en-CA", { timeZone: fuso });
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(agora);
  return { data, hora };
}

function somarDias(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

type DiaResolvido = FaixaDia[] | "fechado" | null;

/** Exceção publicada na data prevalece; sem exceção vale o prompt. */
function diaEfetivo(
  data: string,
  semana: SemanaPrompt,
  clinicaId: string,
  calendarios: CalendarioPublicado[],
): DiaResolvido {
  const { calendario, conflito } = calendarioAplicavel(
    calendarios,
    { clinica_id: clinicaId, unidade_id: null },
    data,
  );
  if (conflito) return null;
  const excecoes = (calendario?.excecoes ?? []).filter((e) => e.data === data);
  if (excecoes.some((e) => e.tipo === "fechado")) return "fechado";
  const especiais = excecoes.filter((e) => e.tipo === "especial" && e.hora_inicio && e.hora_fim);
  if (especiais.length)
    return especiais.map((e) => ({
      inicio: String(e.hora_inicio).slice(0, 5),
      fim: String(e.hora_fim).slice(0, 5),
    }));
  const dow = diaDaSemanaISO(data);
  return dow === null ? null : (semana[dow] ?? null);
}

export function situacaoFuncionamento(params: {
  clinicaId: string;
  semana: SemanaPrompt | null;
  agora: Date;
  calendarios?: CalendarioPublicado[];
}): SituacaoFuncionamento {
  if (!params.semana || !params.clinicaId || Number.isNaN(params.agora.getTime()))
    return { situacao: "desconhecida" };
  const { data: hoje, hora } = localAgora(params.agora, FUSO_PADRAO);
  const agoraMin = minutos(hora);
  for (let i = 0; i <= HORIZONTE_DIAS; i += 1) {
    const data = somarDias(hoje, i);
    const dia = diaEfetivo(data, params.semana, params.clinicaId, params.calendarios ?? []);
    if (!dia) return { situacao: "desconhecida" };
    if (dia === "fechado") continue;
    const faixas = [...dia].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
    if (i === 0 && faixas.some((f) => agoraMin >= minutos(f.inicio) && agoraMin < minutos(f.fim)))
      return { situacao: "aberta" };
    const proxima = faixas.find((f) => i > 0 || minutos(f.inicio) > agoraMin);
    if (proxima)
      return {
        situacao: "fora_do_horario",
        abertura: {
          data,
          hora: proxima.inicio,
          diaSemana: diaDaSemanaISO(data)!,
          quando: i === 0 ? "hoje" : i === 1 ? "amanha" : "outro_dia",
        },
      };
  }
  return { situacao: "desconhecida" };
}

/** "07:00" → "07h"; "07:30" → "07h30". */
function horaFalada(hora: string): string {
  const [h, m] = hora.split(":");
  return m && m !== "00" ? `${h}h${m}` : `${h}h`;
}

/** Frase ao paciente com a abertura e a garantia de atendimento nesse horário. */
export function fraseAberturaPrevista(a: AberturaPrevista): string {
  const nome = NOMES_DIAS[a.diaSemana] ?? "";
  const [, mes, dia] = a.data.split("-");
  const quando =
    a.quando === "hoje"
      ? "hoje"
      : a.quando === "amanha"
        ? `amanhã (${nome})`
        : `${a.diaSemana === 0 || a.diaSemana === 6 ? "no" : "na"} ${nome}, dia ${dia}/${mes}`;
  return `No momento estamos fora do horário de funcionamento. Abrimos ${quando}, às ${horaFalada(a.hora)}, e nesse horário nossa equipe vai te atender por aqui.`;
}
