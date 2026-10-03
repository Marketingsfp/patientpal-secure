import { conversaResolvida } from "./ciclo-responsabilidade";

export const EVENTO_INBOX_ABERTA = "INBOX_ABERTA_ATENDENTE";

export type ConversaNova = {
  id: string;
  status?: string | null;
  owner_type?: string | null;
  is_teste?: boolean | null;
  atribuida_user_id?: string | null;
  inbox_entrada_em?: string | null;
  inbox_aberta_user_id?: string | null;
  inbox_aberta_entrada_em?: string | null;
};

/** Token persistido: muda na atribuição, transferência e reabertura, não em mensagens. */
export function entradaAtendimento(c: ConversaNova): string | null {
  const tempo = c.inbox_entrada_em ? Date.parse(c.inbox_entrada_em) : NaN;
  if (!Number.isFinite(tempo)) return null;
  // PostgreSQL preserva microssegundos: duas atribuições na mesma fração de
  // milissegundo precisam continuar sendo ciclos diferentes.
  const fracao = c.inbox_entrada_em!.match(/\.(\d+)(?:Z|[+-])/i)?.[1] ?? "";
  const micros = fracao.slice(3, 6).padEnd(3, "0");
  return new Date(tempo).toISOString().replace(/(\.\d{3})Z$/, `$1${micros}Z`);
}

export function temAtribuicaoAberta(c: ConversaNova): boolean {
  return (
    !c.is_teste &&
    !conversaResolvida({ owner_type: c.owner_type ?? null, status: c.status }) &&
    c.owner_type === "HUMAN" &&
    !!c.atribuida_user_id &&
    !!entradaAtendimento(c)
  );
}

export function conversaNovaParaAtendente(c: ConversaNova): boolean {
  if (!temAtribuicaoAberta(c)) return false;
  return (
    c.inbox_aberta_user_id !== c.atribuida_user_id ||
    c.inbox_aberta_entrada_em !== entradaAtendimento(c)
  );
}

/** Uma confirmação atrasada nunca consome o selo de outra atribuição. */
export function aplicarAberturaConfirmada<T extends ConversaNova>(
  c: T,
  abertura: { userId: string; entradaEm: string },
): T {
  if (
    !temAtribuicaoAberta(c) ||
    c.atribuida_user_id !== abertura.userId ||
    entradaAtendimento(c) !== abertura.entradaEm
  )
    return c;
  return {
    ...c,
    inbox_aberta_user_id: abertura.userId,
    inbox_aberta_entrada_em: abertura.entradaEm,
  };
}

/** Abrir significa ter o chat carregado e visível; hover, cache e supervisão não contam. */
export function deveRegistrarPrimeiraAbertura(
  c: ConversaNova,
  ctx: {
    userId: string;
    operacional: boolean;
    carregadaId: string | null;
    visivel: boolean;
    carregando: boolean;
  },
): boolean {
  return (
    conversaNovaParaAtendente(c) &&
    c.atribuida_user_id === ctx.userId &&
    ctx.operacional &&
    ctx.carregadaId === c.id &&
    ctx.visivel &&
    !ctx.carregando
  );
}
