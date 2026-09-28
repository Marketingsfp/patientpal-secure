/**
 * Leitura e escrita mínimas de .zip (formato do .docx) usando apenas APIs
 * nativas do navegador (DecompressionStream). A escrita grava as entradas sem
 * compressão ("stored"), o que qualquer leitor de .docx aceita.
 */

async function inflarRaw(dados: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([dados as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function lerZip(arquivo: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(arquivo);
  const dv = new DataView(arquivo);
  // Fim do diretório central: assinatura 0x06054b50, procurada de trás para frente.
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("Arquivo .zip inválido");
  const total = dv.getUint16(fim + 10, true);
  let pos = dv.getUint32(fim + 16, true);
  const decoder = new TextDecoder();
  const saida = new Map<string, Uint8Array>();
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) throw new Error("Diretório do .zip inválido");
    const metodo = dv.getUint16(pos + 10, true);
    const tamCompactado = dv.getUint32(pos + 20, true);
    const tamNome = dv.getUint16(pos + 28, true);
    const tamExtra = dv.getUint16(pos + 30, true);
    const tamComentario = dv.getUint16(pos + 32, true);
    const offsetLocal = dv.getUint32(pos + 42, true);
    const nome = decoder.decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
    pos += 46 + tamNome + tamExtra + tamComentario;
    if (nome.endsWith("/")) continue;
    const inicioDados =
      offsetLocal +
      30 +
      dv.getUint16(offsetLocal + 26, true) +
      dv.getUint16(offsetLocal + 28, true);
    const bruto = bytes.subarray(inicioDados, inicioDados + tamCompactado);
    if (metodo === 0) saida.set(nome, bruto.slice());
    else if (metodo === 8) saida.set(nome, await inflarRaw(bruto));
    else throw new Error(`Compressão ${metodo} não suportada`);
  }
  return saida;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function escreverZip(arquivos: Map<string, Uint8Array>): ArrayBuffer {
  const encoder = new TextEncoder();
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;
  for (const [nome, dados] of arquivos) {
    const nomeBytes = encoder.encode(nome);
    const crc = crc32(dados);
    const local = new Uint8Array(30 + nomeBytes.length);
    const dl = new DataView(local.buffer);
    dl.setUint32(0, 0x04034b50, true);
    dl.setUint16(4, 20, true);
    dl.setUint16(6, 0x0800, true); // nomes em UTF-8
    dl.setUint32(14, crc, true);
    dl.setUint32(18, dados.length, true);
    dl.setUint32(22, dados.length, true);
    dl.setUint16(26, nomeBytes.length, true);
    local.set(nomeBytes, 30);
    const central = new Uint8Array(46 + nomeBytes.length);
    const dc = new DataView(central.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(8, 0x0800, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, dados.length, true);
    dc.setUint32(24, dados.length, true);
    dc.setUint16(28, nomeBytes.length, true);
    dc.setUint32(42, offset, true);
    central.set(nomeBytes, 46);
    locais.push(local, dados);
    centrais.push(central);
    offset += local.length + dados.length;
  }
  const tamCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const df = new DataView(fim.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, arquivos.size, true);
  df.setUint16(10, arquivos.size, true);
  df.setUint32(12, tamCentral, true);
  df.setUint32(16, offset, true);
  const partes = [...locais, ...centrais, fim];
  const saida = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const parte of partes) {
    saida.set(parte, p);
    p += parte.length;
  }
  return saida.buffer;
}
