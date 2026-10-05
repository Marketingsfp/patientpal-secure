import { find } from "linkifyjs";

export const LINK_BLOQUEADO = "[link bloqueado]";

/** Bloqueio local: não resolve DNS, abre endereços nem consulta IA. */
export function bloquearLinksRecebidos(texto: string): string {
  const intervalos = find(texto).filter(link => link.type === "url")
    .map(link => ({ inicio: link.start, fim: link.end }));
  // Protocolos explícitos também são links, mesmo fora dos reconhecidos pelo detector.
  const protocolos = /\b(?:[a-z][a-z0-9+.-]*:\/\/|(?:javascript|data|mailto|tel):)[^\s<>"']+/gi;
  for (const m of texto.matchAll(protocolos)) {
    const trecho = m[0].replace(/[.,!?;:)\]}]+$/g, "");
    intervalos.push({ inicio: m.index!, fim: m.index! + trecho.length });
  }
  // IPv4 sem protocolo, inclusive endereço local com porta/caminho.
  for (const m of texto.matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s<>"']*)?/g)) {
    if (m[0].split(/[/:?#]/)[0]!.split(".").every(n => Number(n) <= 255))
      intervalos.push({ inicio: m.index!, fim: m.index! + m[0].replace(/[.,!?;:)\]}]+$/g, "").length });
  }
  intervalos.sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const unidos: typeof intervalos = [];
  for (const trecho of intervalos) {
    const anterior = unidos.at(-1);
    if (anterior && trecho.inicio <= anterior.fim) anterior.fim = Math.max(anterior.fim, trecho.fim);
    else unidos.push({ ...trecho });
  }
  let saida = "", posicao = 0;
  for (const trecho of unidos) {
    saida += texto.slice(posicao, trecho.inicio) + LINK_BLOQUEADO;
    posicao = trecho.fim;
  }
  return saida + texto.slice(posicao);
}

function bloquearNoPayload(valor: unknown): unknown {
  if (typeof valor === "string") return bloquearLinksRecebidos(valor);
  if (Array.isArray(valor)) return valor.map(bloquearNoPayload);
  if (valor && typeof valor === "object")
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, bloquearNoPayload(v)]));
  return valor;
}

/** Mantém mídia privada, IDs e mensagens de saída; protege texto, transcrição e payload de entrada. */
export function protegerMensagemRecebida<T extends Record<string, any>>(mensagem: T): T {
  if (mensagem.direction !== "in") return mensagem;
  return {
    ...mensagem,
    ...(typeof mensagem.body === "string" ? { body: bloquearLinksRecebidos(mensagem.body) } : {}),
    ...(typeof mensagem.transcricao === "string" ? { transcricao: bloquearLinksRecebidos(mensagem.transcricao) } : {}),
    ...(mensagem.raw ? { raw: bloquearNoPayload(mensagem.raw) } : {}),
  };
}
