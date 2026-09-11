/**
 * Detalhamento dos cards do Financeiro aberto em OUTRA ABA do navegador.
 *
 * A diretoria pediu para manter a visão geral numa aba e o detalhamento em
 * outra. A aba nova não herda nada da memória da tela que a abriu, e montar o
 * detalhamento de novo lá dentro exigiria repetir a carga inteira — no
 * Movimento de Caixa isso inclui os filtros da tela, a chave dos
 * retroativos e a decomposição do pagamento misto, e qualquer diferença
 * faria o detalhamento deixar de bater com o card clicado.
 *
 * Por isso a tabela já pronta (as duas visões) é entregue à aba nova pelo
 * armazenamento do navegador:
 *
 *  1. a tela grava o pacote no `localStorage` com um id aleatório e abre
 *     `<rota>?id=<id>` em nova aba;
 *  2. a aba nova lê o pacote, copia para o próprio `sessionStorage` e APAGA
 *     do `localStorage` na hora.
 *
 * Os dados têm nome de paciente, então nada fica guardado no navegador além
 * do necessário: o `localStorage` guarda o pacote só pelos instantes entre o
 * clique e a abertura (e o que não for lido em dois minutos é descartado), e
 * o `sessionStorage` morre quando a aba é fechada. Recarregar a aba continua
 * funcionando, porque a cópia da sessão sobrevive ao F5.
 *
 * O preço desse desenho: o endereço da aba não serve para mandar a outra
 * pessoa — só abre no navegador que clicou no card.
 */
import type { Detalhe } from "@/lib/financeiro/detalhe-tabela";

export interface PacoteDetalhe {
  /** Visão agrupada; `null` quando o detalhamento só tem a lista. */
  sintetico: Detalhe | null;
  analitico: Detalhe;
  /** Nome do botão da visão agrupada ("Por categoria"…). */
  rotuloSintetico: string;
  /** Prefixo do arquivo do Excel. */
  arquivo: string;
  de: string;
  ate: string;
  clinicaNome: string;
  /** Quando foi gravado (ms desde 1970), para descartar o que ninguém abriu. */
  criadoEm: number;
}

type Armazem = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIXO = "financeiro:detalhe:";
/** Pacote que não foi aberto em dois minutos não vai mais ser: apaga. */
export const VALIDADE_MS = 2 * 60 * 1000;

const chave = (id: string) => `${PREFIXO}${id}`;

function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Apaga os pacotes esquecidos (aba bloqueada, fechada antes de carregar…). */
export function limparPacotesVencidos(armazem: Armazem, agora = Date.now()): void {
  const velhas: string[] = [];
  for (let i = 0; i < armazem.length; i++) {
    const k = armazem.key(i);
    if (!k?.startsWith(PREFIXO)) continue;
    try {
      const p = JSON.parse(armazem.getItem(k) ?? "null") as PacoteDetalhe | null;
      if (!p || agora - p.criadoEm > VALIDADE_MS) velhas.push(k);
    } catch {
      velhas.push(k);
    }
  }
  for (const k of velhas) armazem.removeItem(k);
}

/**
 * Grava o pacote e devolve o id, ou `null` se o navegador recusou (lista
 * grande demais para o armazenamento, navegador em modo que bloqueia o
 * armazenamento).
 */
export function guardarPacote(
  pacote: Omit<PacoteDetalhe, "criadoEm">,
  armazem: Armazem,
  agora = Date.now(),
): string | null {
  limparPacotesVencidos(armazem, agora);
  const id = novoId();
  try {
    armazem.setItem(chave(id), JSON.stringify({ ...pacote, criadoEm: agora }));
    return id;
  } catch {
    return null;
  }
}

/**
 * Lê o pacote na aba nova. Na primeira abertura ele vem do `localStorage` e é
 * movido para a sessão da aba; ao recarregar, vem da sessão.
 */
export function lerPacote(id: string, local: Armazem, sessao: Armazem): PacoteDetalhe | null {
  if (!id) return null;
  const k = chave(id);
  try {
    const daSessao = sessao.getItem(k);
    if (daSessao) return JSON.parse(daSessao) as PacoteDetalhe;
    const doLocal = local.getItem(k);
    if (!doLocal) return null;
    local.removeItem(k);
    try {
      sessao.setItem(k, doLocal);
    } catch {
      // Sem a cópia na sessão a aba só perde o F5; o detalhamento abre igual.
    }
    return JSON.parse(doLocal) as PacoteDetalhe;
  } catch {
    return null;
  }
}

/**
 * Abre o detalhamento em nova aba. Devolve `false` quando não deu — pacote
 * recusado pelo armazenamento ou nova aba bloqueada pelo navegador —, e aí
 * quem chamou mostra o detalhamento na própria tela, como antes.
 *
 * Tem que ser chamada direto no clique: o navegador só deixa abrir aba nova
 * como resposta imediata a um gesto do usuário.
 */
export function abrirDetalheEmNovaAba(
  rota: string,
  pacote: Omit<PacoteDetalhe, "criadoEm">,
): boolean {
  if (typeof window === "undefined") return false;
  let local: Storage;
  try {
    local = window.localStorage;
  } catch {
    return false;
  }
  const id = guardarPacote(pacote, local);
  if (!id) return false;
  const aba = window.open(`${rota}?id=${encodeURIComponent(id)}`, "_blank");
  if (!aba) {
    local.removeItem(chave(id));
    return false;
  }
  try {
    aba.opener = null;
  } catch {
    // Alguns navegadores não deixam mexer; não muda nada para o usuário.
  }
  return true;
}
