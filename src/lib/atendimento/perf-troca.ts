/**
 * FASE 4 — instrumentação da troca entre leads (revisada).
 *
 * Cada navegação (clique num lead) ganha uma identificação própria. Uma
 * resposta que chega atrasada da conversa A não pode marcar etapa nem contar
 * requisição na medição da conversa B: quem marca informa a qual conversa
 * pertence e a marca de outra conversa é descartada.
 *
 * Linha do tempo medida:
 *   T0 clique → T1 seleção → T1b URL trocada → T1c cabeçalho certo
 *   → T2 início das buscas → T3 dados da conversa → T4 mensagens chegaram
 *   → T4b mensagens certas visíveis → T5 tela desenhada → T5b ações liberadas
 *   → T6 scroll no fim → T7 resumo → T8 contato → T9 notas → T9b eventos
 *
 * Também conta requisições (inclusive repetidas), acertos/ausências de cache
 * e montagens/desmontagens da Inbox.
 *
 * Só grava dado técnico: identificadores e tempos. Nunca texto de mensagem,
 * nome, telefone ou qualquer conteúdo de paciente.
 *
 * Desligada por padrão. Para ligar no navegador:
 *   localStorage.setItem("nina:perf", "1")
 * O último relatório fica em window.__perfTroca e o histórico em
 * window.__perfTrocaHist.
 */

export type EtapaTroca =
  | "T0_click"
  | "T1_selecao"
  | "T1b_url"
  | "T1c_cabecalho"
  | "T2_requests"
  | "T3_conversa"
  | "T4_mensagens"
  | "T4b_mensagens_corretas"
  | "T5_render"
  | "T5b_acoes"
  | "T6_scroll"
  | "T7_resumo"
  | "T8_contato"
  | "T9_notas"
  | "T9b_eventos";

type Requisicao = {
  nome: string;
  inicio: number;
  fim: number | null;
  ok: boolean;
  /** Requisição de uma conversa que já não é a atual (resposta atrasada). */
  descartada: boolean;
};

export type Traco = {
  /** Identificação única desta navegação. */
  navId: number;
  conversaId: string;
  /** Origem da abertura: clique na lista, URL direta, voltar/avançar… */
  origem: string;
  t0: number;
  marcas: Partial<Record<EtapaTroca, number>>;
  requests: Requisicao[];
  cache: { acertos: string[]; ausencias: string[] };
  /** Marcas recusadas por pertencerem a outra conversa. */
  ignoradas: number;
  relatado: boolean;
};

let atual: Traco | null = null;
let seq = 0;

/** Montagens/desmontagens acumuladas da Inbox, independentes de navegação. */
const ciclos = { montagens: 0, desmontagens: 0 };

const agora = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function perfLigada(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("nina:perf") === "1";
  } catch {
    return false;
  }
}

/** Chamada apenas para os testes: zera o estado da medição. */
export function _resetPerf() {
  atual = null;
  seq = 0;
  ciclos.montagens = 0;
  ciclos.desmontagens = 0;
}

export function tracoAtual(): Traco | null {
  return atual;
}

/** Uma navegação começou. Devolve o identificador dela (0 = desligada). */
export function iniciarTroca(conversaId: string, origem = "clique"): number {
  if (!perfLigada()) return 0;
  // A navegação anterior que não chegou ao fim ainda assim vira relatório,
  // senão uma troca rápida A→B some da medição.
  if (atual && !atual.relatado) relatar();
  const t = agora();
  atual = {
    navId: ++seq,
    conversaId,
    origem,
    t0: t,
    marcas: { T0_click: t },
    requests: [],
    cache: { acertos: [], ausencias: [] },
    ignoradas: 0,
    relatado: false,
  };
  return atual.navId;
}

/**
 * Marca uma etapa. Quando `conversaId` é informado e não é a conversa da
 * navegação atual, a marca é descartada (resposta atrasada de outro lead).
 */
export function marcarTroca(etapa: EtapaTroca, conversaId?: string) {
  if (!atual) return;
  if (conversaId && conversaId !== atual.conversaId) {
    atual.ignoradas++;
    return;
  }
  if (atual.marcas[etapa] != null) return;
  atual.marcas[etapa] = agora();
  // "Utilizável" = mensagens certas visíveis e scroll posicionado, não skeleton.
  if (etapa === "T6_scroll" && atual.marcas.T4b_mensagens_corretas != null) relatar();
}

/** Registra acerto/ausência de cache (só o nome do recurso, sem conteúdo). */
export function marcarCache(recurso: string, acerto: boolean, conversaId?: string) {
  if (!atual) return;
  if (conversaId && conversaId !== atual.conversaId) return;
  (acerto ? atual.cache.acertos : atual.cache.ausencias).push(recurso);
}

/** Conta montagem/desmontagem da Inbox — o que a Fase 1 precisou zerar. */
export function contarCicloInbox(tipo: "montagem" | "desmontagem") {
  if (tipo === "montagem") ciclos.montagens++;
  else ciclos.desmontagens++;
  if (typeof window !== "undefined") {
    (window as unknown as { __perfInboxCiclos?: unknown }).__perfInboxCiclos = { ...ciclos };
  }
}

export function ciclosInbox() {
  return { ...ciclos };
}

/** Envolve uma busca para medir duração e contar quantas foram feitas. */
export function medirRequest<T>(nome: string, p: Promise<T>, conversaId?: string): Promise<T> {
  if (!atual) return p;
  const traco = atual;
  const descartada = !!conversaId && conversaId !== traco.conversaId;
  const reg: Requisicao = { nome, inicio: agora(), fim: null, ok: false, descartada };
  traco.requests.push(reg);
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

export function relatorioTroca(traco: Traco | null = atual) {
  if (!traco) return null;
  const m = traco.marcas;
  const dur = (nome: string, a?: number, b?: number) => [nome, ms(a, b)] as const;
  const etapas = Object.fromEntries(
    [
      dur("selecao", m.T0_click, m.T1_selecao),
      dur("url", m.T0_click, m.T1b_url),
      dur("cabecalho", m.T0_click, m.T1c_cabecalho),
      dur("inicio_buscas", m.T1_selecao, m.T2_requests),
      dur("conversa", m.T2_requests, m.T3_conversa),
      dur("mensagens", m.T2_requests, m.T4_mensagens),
      dur("mensagens_corretas", m.T0_click, m.T4b_mensagens_corretas),
      dur("render", m.T4_mensagens, m.T5_render),
      dur("acoes", m.T0_click, m.T5b_acoes),
      dur("scroll", m.T5_render, m.T6_scroll),
      dur("resumo", m.T0_click, m.T7_resumo),
      dur("contato", m.T2_requests, m.T8_contato),
      dur("notas", m.T2_requests, m.T9_notas),
      dur("eventos", m.T2_requests, m.T9b_eventos),
      dur("ate_utilizavel", m.T0_click, m.T6_scroll),
    ].filter(([, v]) => v != null),
  ) as Record<string, number>;

  const requests = traco.requests.map((r) => ({
    nome: r.nome,
    ms: r.fim == null ? null : Math.round(r.fim - r.inicio),
    atraso_ate_iniciar: Math.round(r.inicio - traco.t0),
    ok: r.ok,
    descartada: r.descartada,
  }));
  const uteis = requests.filter((r) => !r.descartada);
  const porNome: Record<string, number> = {};
  for (const r of uteis) porNome[r.nome] = (porNome[r.nome] ?? 0) + 1;
  const duplicadas = Object.entries(porNome).filter(([, n]) => n > 1);

  return {
    navId: traco.navId,
    conversaId: traco.conversaId,
    origem: traco.origem,
    etapas,
    total_requests: uteis.length,
    requests_descartadas: requests.length - uteis.length,
    marcas_ignoradas: traco.ignoradas,
    duplicadas,
    cache: { acertos: traco.cache.acertos, ausencias: traco.cache.ausencias },
    inbox: ciclosInbox(),
    requests,
  };
}

function relatar() {
  const traco = atual;
  const r = relatorioTroca(traco);
  if (!r || !traco) return;
  traco.relatado = true;
  if (typeof window !== "undefined") {
    (window as unknown as { __perfTroca?: unknown }).__perfTroca = r;
    const hist = ((window as unknown as { __perfTrocaHist?: unknown[] }).__perfTrocaHist ??= []);
    hist.push(r);
  }
  // eslint-disable-next-line no-console
  console.info("[nina:perf-troca]", JSON.stringify(r));
}

/** Fecha a medição da navegação atual mesmo sem todas as etapas. */
export function encerrarTroca() {
  if (atual && !atual.relatado) relatar();
}
