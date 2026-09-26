/**
 * Jev — contexto enviado junto da mensagem. Puro (sem rede), testável.
 *
 * Corrige a sessão 470 (25/09/2026): o histórico ia fora de ordem, com a
 * mensagem atual, com o paciente marcado como "atendente" (direção `in`/`out`
 * não era reconhecida) e sem a última pergunta completa. Aqui o histórico é
 * montado em ordem cronológica, só do ciclo atual, sem as entradas do turno,
 * e vai junto a etapa do atendimento com as opções já oferecidas.
 */
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { escolhaDeHorariosPendente } from "./horarios-periodo";

export type MensagemHistoricoJev = {
  id?: string | null;
  direction?: string | null;
  body?: string | null;
  created_at?: string | null;
  conversa_id?: string | null;
};

export type FalaJev = { de: "paciente" | "atendente"; texto: string };

/** `in`/`inbound` = paciente; `out`/`outbound` = Nina ou equipe. */
export function autorDaMensagem(direction: unknown): FalaJev["de"] | null {
  const d = String(direction ?? "").toLowerCase();
  if (d === "in" || d === "inbound") return "paciente";
  if (d === "out" || d === "outbound") return "atendente";
  return null;
}

const LIMITE_FALA = 500;
const LIMITE_ULTIMA_PERGUNTA = 1500;

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

/** Mantém começo e fim: a pergunta costuma estar no fim da mensagem. */
function cortarMeio(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const inicio = Math.floor(max * 0.4);
  return `${texto.slice(0, inicio)} … ${texto.slice(texto.length - (max - inicio))}`;
}

export function montarHistoricoJev(
  mensagens: readonly MensagemHistoricoJev[],
  opcoes: {
    /** Mensagens do turno atual: já vão como `mensagem_atual`. */
    excluirIds?: Iterable<string>;
    conversaId?: string | null;
    /** Início do ciclo/sessão atual (ISO). */
    desde?: string | null;
    limite?: number;
  } = {},
): FalaJev[] {
  const excluir = new Set(opcoes.excluirIds ?? []);
  const desde = opcoes.desde ? Date.parse(opcoes.desde) : Number.NaN;
  const validas = mensagens
    .map((m) => ({ m, t: Date.parse(String(m.created_at ?? "")), de: autorDaMensagem(m.direction) }))
    .filter(({ m, t, de }) => {
      if (!de || !String(m.body ?? "").trim()) return false;
      if (m.id && excluir.has(m.id)) return false;
      if (opcoes.conversaId && m.conversa_id && m.conversa_id !== opcoes.conversaId) return false;
      if (Number.isFinite(desde) && Number.isFinite(t) && t < desde) return false;
      return true;
    })
    .sort((a, b) => (Number.isFinite(a.t) ? a.t : 0) - (Number.isFinite(b.t) ? b.t : 0));
  const recentes = validas.slice(-(opcoes.limite ?? 6));
  const ultimaDaAtendente = recentes.map((r) => r.de).lastIndexOf("atendente");
  return recentes.map(({ m, de }, i) => {
    const texto = String(m.body).trim();
    return {
      de: de!,
      texto: i === ultimaDaAtendente ? cortarMeio(texto, LIMITE_ULTIMA_PERGUNTA) : cortar(texto, LIMITE_FALA),
    };
  });
}

export type OpcaoOferecidaJev = { id: string; profissional: string | null; atendimento: string | null };

/** Opções de catálogo já apresentadas nesta sessão (com os IDs do catálogo). */
export function opcoesOferecidasJev(estado: EstadoFluxoNina | null | undefined): OpcaoOferecidaJev[] {
  const conhecimento = estado?.knowledge_context;
  if (!conhecimento) return [];
  if (estado?.session_id && conhecimento.sessionId !== estado.session_id) return [];
  const vistos = new Set<string>();
  const opcoes: OpcaoOferecidaJev[] = [];
  for (const r of conhecimento.referencias ?? []) {
    if (!r.registro || vistos.has(r.registro)) continue;
    vistos.add(r.registro);
    opcoes.push({ id: r.registro, profissional: r.medicoNome ?? null, atendimento: r.procedimento ?? null });
  }
  return opcoes.slice(0, 20);
}

export function contextoAtendimentoJev(estado: EstadoFluxoNina | null | undefined) {
  return {
    etapa: estado?.flow?.stage ?? null,
    especialidade: estado?.appointment?.specialty ?? null,
    atendimento_pesquisado:
      estado?.knowledge_context && (!estado.session_id || estado.knowledge_context.sessionId === estado.session_id)
        ? (estado.knowledge_context.consulta?.termo ?? null)
        : null,
    profissional_escolhido: estado?.appointment?.doctor_name ?? null,
    opcoes_oferecidas: opcoesOferecidasJev(estado),
    // 26/09/2026: a Nina perguntou o período ou mostrou uma lista de horários.
    escolha_de_horarios: escolhaDeHorariosPendente(estado),
  };
}

const IGNORAR = new Set([
  "com", "que", "quero", "prefiro", "pode", "ser", "esse", "essa", "este", "esta", "pra", "para",
  "por", "favor", "sim", "dr", "dra", "doutor", "doutora", "medico", "medica", "consulta", "the",
]);

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavras(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((p) => p.length >= 3 && !IGNORAR.has(p));
}

/**
 * A mensagem escolhe uma das opções já oferecidas? Ex.: "carlos eduardo"
 * depois da lista de Neurologia. Só vale quando aponta para UMA opção.
 */
export function opcaoEscolhidaJev(
  mensagem: string,
  opcoes: readonly OpcaoOferecidaJev[],
): OpcaoOferecidaJev | null {
  const termos = palavras(mensagem);
  if (termos.length === 0 || termos.length > 6) return null;
  const casa = (alvo: string | null) => {
    if (!alvo) return false;
    const p = palavras(alvo);
    return termos.every((t) => p.some((w) => w === t || (t.length >= 4 && w.startsWith(t))));
  };
  const porProfissional = opcoes.filter((o) => casa(o.profissional));
  const profissionais = new Set(porProfissional.map((o) => normalizar(o.profissional!)));
  if (profissionais.size === 1) return porProfissional[0]!;
  if (profissionais.size > 1) return null;
  const porAtendimento = opcoes.filter((o) => casa(o.atendimento));
  const atendimentos = new Set(porAtendimento.map((o) => normalizar(o.atendimento!)));
  return atendimentos.size === 1 ? porAtendimento[0]! : null;
}

/**
 * Marco do andamento: muda quando o atendimento avança (especialidade,
 * profissional, atendimento, horário, paciente identificado ou novas opções).
 * A etapa e a pergunta de esclarecimento ficam de fora de propósito: elas
 * mudam mesmo sem avanço real.
 */
export function marcoAtendimento(estado: EstadoFluxoNina | null | undefined): string {
  return JSON.stringify([
    estado?.appointment?.specialty ?? null,
    estado?.appointment?.doctor_id ?? estado?.appointment?.doctor_name ?? null,
    estado?.appointment?.procedure ?? null,
    estado?.appointment?.slot_inicio ?? null,
    estado?.patient?.identified === true,
    opcoesOferecidasJev(estado)
      .map((o) => o.id)
      .sort()
      .join(","),
  ]).slice(0, 500);
}
