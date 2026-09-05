/**
 * REGRAS PURAS DA LISTA DE CONVERSAS (INBOX) DO ATENDIMENTO.
 *
 * Problema que este módulo resolve: quando chega mensagem nova, o Realtime
 * dispara várias recargas quase ao mesmo tempo. Se cada resposta simplesmente
 * substituísse a lista, o cartão do lead piscava — trocava badge, preview,
 * posição — e depois "voltava" quando uma resposta atrasada chegava fora de
 * ordem.
 *
 * Aqui a lista nova é MESCLADA na anterior:
 *  - campo ausente/nulo no payload novo nunca apaga o valor já exibido;
 *  - quando nada muda, o objeto anterior é devolvido (mesma referência), então
 *    o React não re-renderiza o cartão à toa;
 *  - a ordenação "mais recentes" usa uma única fonte (`ultima_msg_em`), com
 *    desempate estável pelo id, evitando o vai-e-volta de posição.
 */

export interface ConversaInbox {
  id: string;
  [campo: string]: unknown;
}

/** Mescla um registro novo no anterior sem apagar o que não veio no payload. */
export function mesclarConversa<T extends ConversaInbox>(anterior: T | undefined, nova: T): T {
  if (!anterior) return nova;
  const resultado: Record<string, unknown> = { ...anterior };
  let mudou = false;
  for (const [chave, valor] of Object.entries(nova)) {
    if (valor === undefined) continue;
    // `null` só é aceito quando o campo já existe no payload novo E o anterior
    // também não tinha valor — assim uma resposta parcial não zera o
    // responsável, o status ou o preview que já estavam na tela.
    if (valor === null && anterior[chave] != null) continue;
    if (resultado[chave] !== valor) {
      resultado[chave] = valor;
      mudou = true;
    }
  }
  return mudou ? (resultado as T) : anterior;
}

/**
 * Mescla a lista recebida do servidor na lista já exibida. A composição da
 * lista (quem entra e quem sai) segue o payload novo; o conteúdo de cada
 * cartão é mesclado.
 */
export function mesclarListaConversas<T extends ConversaInbox>(anteriores: T[], novas: T[]): T[] {
  const porId = new Map(anteriores.map((c) => [c.id, c]));
  let mudou = anteriores.length !== novas.length;
  const saida = novas.map((nova, i) => {
    const mesclada = mesclarConversa(porId.get(nova.id), nova);
    if (!mudou && anteriores[i] !== mesclada) mudou = true;
    return mesclada;
  });
  return mudou ? saida : anteriores;
}

function instante(valor: unknown): number {
  if (!valor) return 0;
  const t = new Date(String(valor)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Ordenação única e estável de "mais recentes" (fonte: `ultima_msg_em`). */
export function ordenarPorRecentes<T extends ConversaInbox>(lista: T[]): T[] {
  const ordenada = [...lista].sort((a, b) => {
    const d = instante(b["ultima_msg_em"]) - instante(a["ultima_msg_em"]);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const igual = ordenada.every((c, i) => c === lista[i]);
  return igual ? lista : ordenada;
}

/** Mescla o mapa de espera preservando a referência quando nada muda. */
export function mesclarEspera(
  anterior: Record<string, string>,
  novo: Record<string, string>,
): Record<string, string> {
  const chavesA = Object.keys(anterior);
  const chavesN = Object.keys(novo);
  if (chavesA.length === chavesN.length && chavesN.every((k) => anterior[k] === novo[k])) {
    return anterior;
  }
  return novo;
}
