/**
 * Nina → Métricas: interpretação central do recorte de data e horário.
 *
 * SOMENTE LEITURA. Este módulo apenas calcula janelas de tempo; não altera
 * prompt, memória, decisões, agendamento ou distribuição da Nina.
 *
 * Regras (FASE 2):
 * - O recorte usa o fuso da operação da clínica (padrão America/Sao_Paulo),
 *   nunca o fuso do computador de quem abre o painel.
 * - Início inclusivo, fim exclusivo: 07:00 entra, 12:00 não entra.
 * - Com várias datas, a faixa de horário vale separadamente em cada dia
 *   (10 a 12/09 das 07:00 às 12:00 = três janelas, sem as tardes/noites).
 * - "Dia inteiro" cobre 00:00:00.000 até o instante anterior à meia-noite
 *   seguinte, sem perder registros com segundos ou milissegundos.
 */

export const FUSO_OPERACAO_PADRAO = "America/Sao_Paulo";

export type RecorteTempo = {
  /** AAAA-MM-DD */
  de: string;
  /** AAAA-MM-DD */
  ate: string;
  diaInteiro: boolean;
  /** HH:MM — obrigatório quando diaInteiro = false */
  horaInicio?: string | null;
  /** HH:MM — obrigatório quando diaInteiro = false */
  horaFim?: string | null;
  fuso?: string | null;
};

export type Janela = { inicio: string; fim: string };

export type RecorteResolvido = {
  janelas: Janela[];
  /** Menor início e maior fim, para a consulta única ao banco. */
  inicio: string;
  fim: string;
  fuso: string;
  diaInteiro: boolean;
  minutoInicio: number;
  minutoFim: number;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

export function validarRecorte(r: RecorteTempo): string | null {
  if (!DATA_RE.test(r.de) || !DATA_RE.test(r.ate)) {
    return "Informe a data inicial e a data final.";
  }
  if (r.de > r.ate) {
    return "A data inicial não pode ser posterior à data final.";
  }
  if (!r.diaInteiro) {
    if (!r.horaInicio || !r.horaFim || !HORA_RE.test(r.horaInicio) || !HORA_RE.test(r.horaFim)) {
      return "Informe o horário inicial e o horário final, ou marque “Dia inteiro”.";
    }
    if (minutos(r.horaFim) <= minutos(r.horaInicio)) {
      return "O horário final deve ser posterior ao inicial. Faixas que atravessam a madrugada não são aceitas aqui — corrija a seleção.";
    }
  }
  return null;
}

export function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number };

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string) {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** Partes de data/hora de um instante, no fuso informado. */
export function partesNoFuso(instante: Date, fuso: string): Partes {
  const p = Object.fromEntries(
    formatador(fuso)
      .formatToParts(instante)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour === "24" ? "0" : p.hour),
    minuto: Number(p.minute),
  };
}

function deslocamentoMs(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  // Zera segundos/ms do instante original para comparar apenas até o minuto.
  const base = Math.floor(instante.getTime() / 60000) * 60000;
  return comoUtc - base;
}

/** Instante UTC correspondente a uma data/hora local do fuso da clínica. */
export function instanteLocal(
  ano: number,
  mes: number,
  dia: number,
  minutoDoDia: number,
  fuso: string,
): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, 0, 0) + minutoDoDia * 60000;
  let palpite = new Date(alvo);
  for (let i = 0; i < 3; i += 1) {
    const off = deslocamentoMs(palpite, fuso);
    const proximo = new Date(alvo - off);
    if (proximo.getTime() === palpite.getTime()) break;
    palpite = proximo;
  }
  return palpite;
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  x.setUTCDate(x.getUTCDate() + dias);
  return x.toISOString().slice(0, 10);
}

/**
 * Resolve o recorte em janelas UTC (uma por dia). Lança erro quando a
 * seleção é inválida — validarRecorte() deve ser usado antes na tela.
 */
export function resolverRecorte(r: RecorteTempo): RecorteResolvido {
  const erro = validarRecorte(r);
  if (erro) throw new Error(erro);

  const fuso = r.fuso?.trim() || FUSO_OPERACAO_PADRAO;
  const minutoInicio = r.diaInteiro ? 0 : minutos(r.horaInicio!);
  const minutoFim = r.diaInteiro ? 24 * 60 : minutos(r.horaFim!);

  const janelas: Janela[] = [];
  for (let data = r.de; data <= r.ate; data = somarDias(data, 1)) {
    const [ano, mes, dia] = data.split("-").map(Number);
    janelas.push({
      inicio: instanteLocal(ano, mes, dia, minutoInicio, fuso).toISOString(),
      fim: instanteLocal(ano, mes, dia, minutoFim, fuso).toISOString(),
    });
    if (janelas.length > 400) break;
  }

  return {
    janelas,
    inicio: janelas[0]!.inicio,
    fim: janelas[janelas.length - 1]!.fim,
    fuso,
    diaInteiro: r.diaInteiro,
    minutoInicio,
    minutoFim,
  };
}

/** O instante pertence ao recorte? (início inclusivo, fim exclusivo) */
export function dentroDoRecorte(iso: string, recorte: RecorteResolvido): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (t < new Date(recorte.inicio).getTime() || t >= new Date(recorte.fim).getTime()) return false;
  if (recorte.diaInteiro) return true;
  return recorte.janelas.some(
    (j) => t >= new Date(j.inicio).getTime() && t < new Date(j.fim).getTime(),
  );
}

/** Rótulo do balde temporal, sempre no fuso da clínica. */
export function baldeLocal(
  iso: string,
  granularidade: "dia" | "semana" | "mes",
  fuso: string = FUSO_OPERACAO_PADRAO,
): string {
  const p = partesNoFuso(new Date(iso), fuso);
  const mm = String(p.mes).padStart(2, "0");
  const dd = String(p.dia).padStart(2, "0");
  if (granularidade === "mes") return `${p.ano}-${mm}`;
  if (granularidade === "semana") {
    const base = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
    const diaSemana = (base.getUTCDay() + 6) % 7; // segunda = 0
    base.setUTCDate(base.getUTCDate() - diaSemana);
    return base.toISOString().slice(0, 10);
  }
  return `${p.ano}-${mm}-${dd}`;
}

/** Texto curto para a ajuda discreta do filtro. */
export function descricaoRecorte(recorte: RecorteResolvido): string {
  const dias = recorte.janelas.length;
  if (recorte.diaInteiro) {
    return `${dias} dia(s) completo(s), fuso ${recorte.fuso}.`;
  }
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${dias} dia(s), das ${fmt(recorte.minutoInicio)} às ${fmt(
    recorte.minutoFim,
  )} de cada dia (fim exclusivo), fuso ${recorte.fuso}.`;
}
