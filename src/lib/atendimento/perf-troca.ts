/**
 * FASE 1 — instrumentação temporária da troca entre leads.
 *
 * Mede, para cada clique num lead, a linha do tempo completa:
 *   T0 clique → T1 seleção → T2 início das buscas → T3 dados da conversa
 *   → T4 mensagens → T5 tela desenhada → T6 scroll no fim
 *   → T7 resumo da Nina → T8 dados do contato
 *
 * Também conta quantas buscas foram disparadas (inclusive repetidas) e o
 * tempo de cada uma, para revelar fila de espera (waterfall) e duplicação.
 *
 * Fica desligada por padrão. Para ligar no navegador:
 *   localStorage.setItem("nina:perf", "1")
 * O último relatório fica em window.__perfTroca.
 */

export type EtapaTroca =
  | "T0_click"
  | "T1_selecao"
  | "T2_requests"
  | "T3_conversa"
  | "T4_mensagens"
  | "T5_render"
  | "T6_scroll"
  | "T7_resumo"
  | "T8_contato";

type Requisicao = { nome: string; inicio: number; fim: number | null; ok: boolean };

type Traco = {
  conversaId: string;
  t0: number;
  marcas: Partial<Record<EtapaTroca, number>>;
  requests: Requisicao[];
};

let atual: Traco | null = null;

const agora = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function perfLigada(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("nina:perf") === "1";
  } catch {
    return false;
  }
}

export function iniciarTroca(conversaId: string) {
  if (!perfLigada()) return;
  atual = { conversaId, t0: agora(), marcas: { T0_click: agora() }, requests: [] };
}

export function marcarTroca(etapa: EtapaTroca) {
  if (!atual || atual.marcas[etapa] != null) return;
  atual.marcas[etapa] = agora();
  if (etapa === "T6_scroll") relatar();
}

/** Envolve uma busca para medir duração e contar quantas foram feitas. */
export function medirRequest<T>(nome: string, p: Promise<T>): Promise<T> {
  if (!atual) return p;
  const reg: Requisicao = { nome, inicio: agora(), fim: null, ok: false };
  atual.requests.push(reg);
  return p.then(
    (v) => {
      reg.fim = agora();
      reg.ok = true;
      return v;
    },
    (e) => {
      reg.fim = agora();
      throw e;
    },
  );
}

function ms(a?: number, b?: number): number | null {
  if (a == null || b == null) return null;
  return Math.max(0, Math.round(b - a));
}

export function relatorioTroca() {
  if (!atual) return null;
  const m = atual.marcas;
  const dur = (nome: string, a?: number, b?: number) => [nome, ms(a, b)] as const;
  const etapas = Object.fromEntries(
    [
      dur("Selection", m.T0_click, m.T1_selecao),
      dur("Requests_start", m.T1_selecao, m.T2_requests),
      dur("Conversation", m.T2_requests, m.T3_conversa),
      dur("Messages", m.T2_requests, m.T4_mensagens),
      dur("Render", m.T4_mensagens, m.T5_render),
      dur("Scroll", m.T5_render, m.T6_scroll),
      dur("Summary", m.T0_click, m.T7_resumo),
      dur("Contact", m.T2_requests, m.T8_contato),
      dur("Time_until_usable", m.T0_click, m.T6_scroll),
    ].filter(([, v]) => v != null),
  ) as Record<string, number>;

  const requests = atual.requests.map((r) => ({
    nome: r.nome,
    ms: r.fim == null ? null : Math.round(r.fim - r.inicio),
    atraso_ate_iniciar: Math.round(r.inicio - atual!.t0),
    ok: r.ok,
  }));
  const porNome: Record<string, number> = {};
  for (const r of requests) porNome[r.nome] = (porNome[r.nome] ?? 0) + 1;
  const duplicadas = Object.entries(porNome).filter(([, n]) => n > 1);

  return {
    conversaId: atual.conversaId,
    etapas,
    total_requests: requests.length,
    duplicadas,
    requests,
  };
}

function relatar() {
  const r = relatorioTroca();
  if (!r) return;
  if (typeof window !== "undefined") {
    (window as unknown as { __perfTroca?: unknown }).__perfTroca = r;
    const hist = ((window as unknown as { __perfTrocaHist?: unknown[] }).__perfTrocaHist ??= []);
    hist.push(r);
  }
  // eslint-disable-next-line no-console
  console.info("[nina:perf-troca]", JSON.stringify(r));
}
