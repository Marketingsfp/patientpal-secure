/**
 * Leitura de arquivos JSON Lines (1 objeto por linha) em pedaços, sem carregar
 * o arquivo inteiro na memória. Usado pela importação do sistema antigo
 * (Clínica Total), onde os arquivos têm centenas de MB.
 *
 * Quebras de linha DENTRO de um texto vêm escapadas como \n no JSON, então
 * cada quebra real separa um registro. Uma linha pode chegar cortada entre
 * dois pedaços do arquivo: o resto fica guardado até o pedaço seguinte.
 */

export type LinhaLida = { n: number; d: Record<string, unknown> } | { n: number; e: string };

/** Lê o fluxo de bytes e devolve cada linha (sem o \r\n), na ordem. */
export async function* lerLinhas(
  fluxo: ReadableStream<Uint8Array>,
  aoLerBytes?: (bytes: number) => void,
): AsyncGenerator<string> {
  const leitor = fluxo.getReader();
  const decodificador = new TextDecoder("utf-8");
  let resto = "";
  let primeiro = true;
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      aoLerBytes?.(value.byteLength);
      resto += decodificador.decode(value, { stream: true });
      if (primeiro) {
        resto = resto.replace(/^\uFEFF/, "");
        primeiro = false;
      }
      let i = resto.indexOf("\n");
      while (i >= 0) {
        yield resto.slice(0, i).replace(/\r$/, "");
        resto = resto.slice(i + 1);
        i = resto.indexOf("\n");
      }
    }
    resto += decodificador.decode();
    if (primeiro) resto = resto.replace(/^\uFEFF/, "");
    if (resto.length > 0) yield resto.replace(/\r$/, "");
  } finally {
    leitor.releaseLock();
  }
}

/** Converte uma linha no formato enviado ao banco; `null` para linha vazia. */
export function interpretarLinha(texto: string, n: number): LinhaLida | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const obj: unknown = JSON.parse(t);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { n, e: "Linha não é um objeto JSON" };
    }
    return { n, d: obj as Record<string, unknown> };
  } catch {
    return { n, e: "JSON inválido na linha" };
  }
}

/** Lote cheio: por quantidade de linhas ou por tamanho (textos longos de prontuário). */
export function loteCheio(qtd: number, bytes: number, maxLinhas = 500, maxBytes = 3_000_000) {
  return qtd >= maxLinhas || bytes >= maxBytes;
}
