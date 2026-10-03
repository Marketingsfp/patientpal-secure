import { hojeBR } from "@/lib/date-utils";

/** Calendário de Brasília, independente do fuso do computador. */
export function periodoDashboard(dias: number, hoje = hojeBR()) {
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias + 1);
  return { de: data.toISOString().slice(0, 10), ate: hoje };
}

export type MensagemHumanaDashboard = {
  created_at: string;
  conversa_id: string | null;
  enviada_por_user_id: string | null;
  enviada_por: string | null;
  status: string | null;
};
export type EncerramentoHumanoDashboard = {
  resolved_by: string | null;
  resolved_at: string | null;
  handoff_em: string | null;
  assigned_at: string | null;
};

const media = (ns: number[]) =>
  ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
const horaBR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});
/** Mensagem operacional automática não é resposta de atendente, mesmo com autor associado. */
export function resumirMensagensHumanas(linhas: MensagemHumanaDashboard[]) {
  const humanas = linhas.filter(
    (m) =>
      m.status !== "system" &&
      !["nina", "system", "sistema", "automatico"].includes(String(m.enviada_por).toLowerCase()) &&
      (m.enviada_por === "humano" || !!m.enviada_por_user_id),
  );
  const enviadas = humanas.filter((m) => ["sent", "delivered", "read"].includes(m.status ?? ""));
  const porHora = Array.from({ length: 24 }, () => 0);
  const porDia = new Map<string, number>();
  const porPessoa = new Map<string, number>();
  const conversas = new Set<string>();
  const diaBR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const m of enviadas) {
    const d = new Date(m.created_at);
    if (!Number.isNaN(d.getTime())) {
      porHora[Number(horaBR.format(d))]++;
      const dia = diaBR.format(d);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    if (m.conversa_id) conversas.add(m.conversa_id);
    if (m.enviada_por_user_id)
      porPessoa.set(m.enviada_por_user_id, (porPessoa.get(m.enviada_por_user_id) ?? 0) + 1);
  }
  return {
    enviadas: enviadas.length,
    falhas: humanas.filter((m) => m.status === "failed").length,
    outrosEstados:
      humanas.length - enviadas.length - humanas.filter((m) => m.status === "failed").length,
    conversasRespondidas: conversas.size,
    semAutora: enviadas.filter((m) => !m.enviada_por_user_id).length,
    porHora,
    porDia: [...porDia]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, total]) => ({ dia, total })),
    porPessoa: [...porPessoa]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total),
  };
}

export function resumirEncerramentosHumanos(linhas: EncerramentoHumanoDashboard[]) {
  const porPessoa = new Map<string, number>();
  const duracoes: number[] = [];
  for (const l of linhas) {
    if (l.resolved_by) porPessoa.set(l.resolved_by, (porPessoa.get(l.resolved_by) ?? 0) + 1);
    const inicio = Date.parse(l.handoff_em ?? l.assigned_at ?? "");
    const fim = Date.parse(l.resolved_at ?? "");
    if (Number.isFinite(inicio) && Number.isFinite(fim) && fim >= inicio)
      duracoes.push((fim - inicio) / 1000);
  }
  return {
    total: linhas.length,
    semAutoria: linhas.filter((l) => !l.resolved_by).length,
    duracaoMediaSeg: media(duracoes),
    duracoesMedidas: duracoes.length,
    porPessoa: [...porPessoa]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total),
  };
}

export function resumirPrimeiraRespostaHumanas(valores: (number | null)[]) {
  const medidas = valores.filter((n): n is number => n !== null && Number.isFinite(n) && n >= 0);
  return { mediaSeg: media(medidas), medidas: medidas.length };
}
