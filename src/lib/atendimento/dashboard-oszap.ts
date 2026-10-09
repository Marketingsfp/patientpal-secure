import { janelaDiaClinica } from "@/lib/date-utils";
import { totaisVazios, type DiaDashboard, type PeriodoDashboard } from "./dashboard-oszap-periodos";

export type MensagemHumanaDashboard = {
  id: string;
  created_at: string;
  conversa_id: string | null;
  direction: string;
  enviada_por_user_id: string | null;
  enviada_por: string | null;
  status: string | null;
};
export type EventoHistoricoDashboard = {
  id: string;
  created_at: string;
  conversa_id: string;
  evento: string;
  user_id: string | null;
  automatico?: unknown;
  protocol_number?: unknown;
  protocolo_informado?: unknown;
};
export const EVENTOS_DASHBOARD = [
  "HANDOFF_SOLICITADO",
  "ENTROU_NA_FILA",
  "ASSUMIDA",
  "TRANSFERIDA",
  "DESATRIBUIDA",
  "FINALIZADA",
  "REABERTA",
  "ATRIBUIDA_IA",
  "DEVOLVIDA_PARA_IA",
];
const horaBR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});
const diaBR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const media = (valores: number[]) =>
  valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
function mensagemHumana(m: MensagemHumanaDashboard) {
  return (
    m.direction === "out" &&
    m.status !== "system" &&
    !["nina", "system", "sistema", "automatico"].includes((m.enviada_por ?? "").toLowerCase()) &&
    (m.enviada_por === "humano" || !!m.enviada_por_user_id)
  );
}
/** Reconstrói ciclos pelos eventos imutáveis. Nunca usa o responsável/status atual. */
export function resumirHistoricoDashboard(
  mensagens: MensagemHumanaDashboard[],
  eventos: EventoHistoricoDashboard[],
  periodo: PeriodoDashboard,
) {
  const inicio = Date.parse(janelaDiaClinica(periodo.de).inicio);
  const fim = Date.parse(janelaDiaClinica(periodo.ate).fimExclusivo);
  const dias = new Map<string, DiaDashboard>();
  const pessoas = new Map<
    string,
    { id: string; mensagens: number; encerradas: number; transferencias: number }
  >();
  const pessoa = (id: string) => {
    const p = pessoas.get(id) ?? { id, mensagens: 0, encerradas: 0, transferencias: 0 };
    pessoas.set(id, p);
    return p;
  };
  const dia = (em: string) => {
    const chave = diaBR.format(new Date(em));
    const d = dias.get(chave) ?? { dia: chave, ...totaisVazios() };
    dias.set(chave, d);
    return d;
  };
  const horas = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    recebidas: 0,
    enviadas: 0,
    total: 0,
  }));
  const estado = new Map<
    string,
    { inicio: number | null; primeiraResposta: boolean; conhecido: boolean }
  >();
  const duracoes: number[] = [],
    respostas: number[] = [];
  const conversas = new Set<string>();
  let recebidas = 0,
    enviadas = 0,
    falhas = 0,
    outrosEstados = 0,
    semAutora = 0;
  let recebidasSemHistorico = 0,
    recebidasForaEtapaHumana = 0,
    encerradas = 0,
    transferencias = 0;
  const linhas = [
    ...eventos.map((e) => ({
      id: `e:${e.id}`,
      em: Date.parse(e.created_at),
      evento: e,
      mensagem: null,
    })),
    ...mensagens.map((m) => ({
      id: `m:${m.id}`,
      em: Date.parse(m.created_at),
      evento: null,
      mensagem: m,
    })),
  ]
    .filter((l) => Number.isFinite(l.em) && l.em < fim)
    .sort((a, b) => a.em - b.em || a.id.localeCompare(b.id));
  const vistos = new Set<string>();
  for (const l of linhas) {
    if (vistos.has(l.id)) continue;
    vistos.add(l.id);
    const id = l.evento?.conversa_id ?? l.mensagem?.conversa_id ?? `sem-vinculo:${l.id}`;
    const s = estado.get(id) ?? { inicio: null, primeiraResposta: false, conhecido: false };
    estado.set(id, s);
    const noPeriodo = l.em >= inicio;
    const e = l.evento;
    if (e) {
      if (
        ["HANDOFF_SOLICITADO", "ASSUMIDA"].includes(e.evento) &&
        (e.protocol_number || e.protocolo_informado)
      )
        continue;
      if (
        ["HANDOFF_SOLICITADO", "ENTROU_NA_FILA", "DESATRIBUIDA", "TRANSFERIDA"].includes(
          e.evento,
        ) ||
        (e.evento === "ASSUMIDA" && e.user_id)
      ) {
        if (s.inicio === null) {
          s.inicio = l.em;
          s.primeiraResposta = false;
        }
        s.conhecido = true;
      }
      if (e.evento === "TRANSFERIDA" && e.user_id && e.automatico !== true && noPeriodo) {
        transferencias++;
        dia(e.created_at).transferencias++;
        pessoa(e.user_id).transferencias++;
      }
      if (e.evento === "FINALIZADA" && e.user_id && e.automatico !== true && noPeriodo) {
        encerradas++;
        dia(e.created_at).encerradas++;
        pessoa(e.user_id).encerradas++;
        if (s.inicio !== null) duracoes.push((l.em - s.inicio) / 1000);
      }
      if (["FINALIZADA", "REABERTA", "ATRIBUIDA_IA", "DEVOLVIDA_PARA_IA"].includes(e.evento)) {
        s.inicio = null;
        s.primeiraResposta = false;
        s.conhecido = true;
      }
      continue;
    }
    const m = l.mensagem!;
    let direcao: "recebidas" | "enviadas";
    if (mensagemHumana(m)) {
      if (!["sent", "delivered", "read"].includes(m.status ?? "")) {
        if (noPeriodo) {
          if (m.status === "failed") falhas++;
          else outrosEstados++;
        }
        continue;
      }
      if (s.inicio !== null && !s.primeiraResposta) {
        if (noPeriodo) respostas.push((l.em - s.inicio) / 1000);
        s.primeiraResposta = true;
      }
      if (!noPeriodo) continue;
      enviadas++;
      direcao = "enviadas";
      if (m.conversa_id) conversas.add(m.conversa_id);
      if (m.enviada_por_user_id) pessoa(m.enviada_por_user_id).mensagens++;
      else semAutora++;
    } else if (
      m.direction === "in" &&
      m.status !== "system" &&
      m.status !== "failed" &&
      noPeriodo
    ) {
      if (s.inicio === null) {
        if (!s.conhecido) recebidasSemHistorico++;
        else recebidasForaEtapaHumana++;
        continue;
      }
      recebidas++;
      direcao = "recebidas";
    } else continue;
    const d = dia(m.created_at);
    d[direcao]++;
    d.total++;
    const h = horas[Number(horaBR.format(new Date(m.created_at)))];
    h[direcao]++;
    h.total++;
  }
  return {
    mensagens: {
      recebidas,
      enviadas,
      total: recebidas + enviadas,
      falhas,
      outrosEstados,
      semAutora,
      conversasRespondidas: conversas.size,
      recebidasSemHistorico,
      recebidasForaEtapaHumana,
      porHora: horas,
    },
    encerramentos: {
      total: encerradas,
      duracaoMediaSeg: media(duracoes),
      duracoesMedidas: duracoes.length,
    },
    primeiraResposta: { mediaSeg: media(respostas), medidas: respostas.length },
    transferencias: { total: transferencias },
    porDia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    pessoas: [...pessoas.values()].sort((a, b) => b.mensagens - a.mensagens),
  };
}
