/** Regras comuns da foto pelo celular (computador, celular e servidor). */

/** Código da sessão: 48 caracteres hexadecimais aleatórios. */
export const TOKEN_FOTO = /^[a-f0-9]{48}$/;

/** Fotos que o celular pode mandar numa mesma sessão (cada uma passa pela IA). */
export const MAX_TENTATIVAS_FOTO = 5;

export function novoTokenFoto(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Endereço que o QR code abre no celular. */
export const linkFotoCelular = (origem: string, token: string) => `${origem}/p/pedido/${token}`;

/** Teto do arquivo enviado de fato (bytes) — cabe uma foto grande sem recompressão agressiva. */
export const MAX_BYTES_FOTO = 15_000_000;
/** Mesmo teto em data URL (base64 ≈ 4/3 + cabeçalho). */
export const MAX_DATA_URL_FOTO = Math.ceil((MAX_BYTES_FOTO * 4) / 3) + 200;
