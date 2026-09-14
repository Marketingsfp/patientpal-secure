/** Estado persistido do executor de carga. Timeout não é prova de cancelamento. */
export const LEASE_CARGA_MS = 120_000;
export const HEARTBEAT_CARGA_MS = 20_000;
export const QUARENTENA_CARGA_MS = 300_000;
export const OCIOSIDADE_CARGA_MS = 300_000;
export const VERSAO_EXECUTOR_CARGA = "carga-v2-sol-lease";
export const STATUS_ATIVOS_CARGA = ["preparando", "executando"] as const;

export type LeaseCarga = {
  token: string;
  fase: "preflight" | "lote";
  heartbeatEm: string;
  expiraEm: string;
  indices: number[];
};
export type ControleExecucaoCarga = {
  versao: 1;
  lease: LeaseCarga | null;
  motivo: string | null;
  erro: string | null;
  recuperada: boolean;
  indicesIncertos: number[];
  proximoDisparoEm: string | null;
};
export type CargaPersistida = {
  id: string;
  nome: string;
  enviadas: number;
  total_planejado: number;
  clinica_id: string;
  status: string;
  cancelar: boolean;
  updated_at: string;
  created_at?: string;
  iniciado_em?: string;
  ultima_amostra_em?: string | null;
  config: unknown;
  [campo: string]: any;
};
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const dataMs = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : 0;

export function controleExecucaoCarga(config: unknown): ControleExecucaoCarga {
  const c = objeto(objeto(config)._execucaoCarga);
  const l = objeto(c.lease);
  const indices = (v: unknown) =>
    Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && Number(n) >= 0) : [];
  const lease =
    c.versao === 1 &&
    texto(l.token) &&
    ["preflight", "lote"].includes(String(l.fase)) &&
    dataMs(l.expiraEm) &&
    dataMs(l.heartbeatEm)
      ? {
          token: String(l.token),
          fase: l.fase as LeaseCarga["fase"],
          heartbeatEm: String(l.heartbeatEm),
          expiraEm: String(l.expiraEm),
          indices: indices(l.indices),
        }
      : null;
  return {
    versao: 1,
    lease,
    motivo: texto(c.motivo),
    erro: texto(c.erro),
    recuperada: c.recuperada === true,
    indicesIncertos: indices(c.indicesIncertos),
    proximoDisparoEm: texto(c.proximoDisparoEm),
  };
}

export function configComControle(config: unknown, controle: ControleExecucaoCarga) {
  return { ...objeto(config), _execucaoCarga: controle };
}

export function atividadeCarga(carga: CargaPersistida): number {
  const controle = controleExecucaoCarga(carga.config);
  return Math.max(
    dataMs(carga.updated_at),
    dataMs(carga.created_at),
    dataMs(carga.ultima_amostra_em),
    dataMs(controle.lease?.heartbeatEm),
  );
}

/** UI recebe sinal de atividade; atualizar a tela não renova o lease. */
export function estadoControleCarga(carga: CargaPersistida, agora = Date.now()) {
  const c = controleExecucaoCarga(carga.config);
  const ativo = STATUS_ATIVOS_CARGA.includes(carga.status as never);
  const fimLease = dataMs(c.lease?.expiraEm);
  const ocupado = !!c.lease && agora < fimLease + QUARENTENA_CARGA_MS;
  const orfa = ativo && (c.lease ? !ocupado : agora - atividadeCarga(carga) > OCIOSIDADE_CARGA_MS);
  return {
    ativo,
    ocupado,
    podeRetomar: ativo && !ocupado && !orfa && !carga.cancelar,
    orfa,
    recuperada: c.recuperada,
    motivo: c.motivo,
    erro: c.erro,
    ultimaAtividadeEm: atividadeCarga(carga) ? new Date(atividadeCarga(carga)).toISOString() : null,
    leaseExpiraEm: c.lease?.expiraEm ?? null,
    emQuarentena: !!c.lease && agora >= fimLease && ocupado,
    indicesIncertos: c.indicesIncertos,
    proximoDisparoEm: c.proximoDisparoEm,
    aguardarMs: Math.max(0, dataMs(c.proximoDisparoEm) - agora),
  };
}

export function patchRecuperarCarga(carga: CargaPersistida, agora = Date.now()) {
  const estado = estadoControleCarga(carga, agora);
  if (!estado.orfa) return null;
  const c = controleExecucaoCarga(carga.config);
  const erro = c.lease
    ? "O executor perdeu atividade e o prazo de segurança expirou. As mensagens em andamento não serão reenviadas automaticamente."
    : "O teste ficou sem atividade do executor. Foi encerrado para liberar um novo teste.";
  return {
    status: carga.cancelar ? "parado" : "erro",
    cancelar: true,
    finalizado_em: new Date(agora).toISOString(),
    config: configComControle(carga.config, {
      ...c,
      lease: null,
      recuperada: true,
      motivo: "EXECUTOR_SEM_ATIVIDADE",
      erro,
      indicesIncertos: [...new Set([...c.indicesIncertos, ...(c.lease?.indices ?? [])])],
    }),
  };
}

export function chaveMensagemCarga(cargaId: string, indice: number): string {
  return `carga-${cargaId}-${indice}`;
}

/** Não processa duas mensagens do mesmo lead em paralelo. */
export function proximaRodadaCarga<T extends { leadId: string }>(
  plano: T[],
  inicio: number,
  max: number,
): T[] {
  const rodada: T[] = [];
  const leads = new Set<string>();
  for (const item of plano.slice(inicio, inicio + max)) {
    if (leads.has(item.leadId)) break;
    leads.add(item.leadId);
    rodada.push(item);
  }
  return rodada;
}
