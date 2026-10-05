import { interpretarLeituraImagem, type LeituraImagem } from "./leitura-imagem";

export const PEDIR_NOVA_FOTO = "Não consegui ler a foto com segurança.\n\nPode enviar outra foto mais nítida, com boa iluminação e o documento inteiro, sem cortes?";
export const FOTO_SEGUNDA_FALHA = "FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA";
export type MensagemFoto = {
  id: string; direction: string; tipo?: string | null; body?: string | null;
  transcricao?: string | null; raw?: unknown; created_at: string;
  status?: string | null; enviada_por?: string | null;
};
export function leituraSalvaDaFoto(raw: unknown): LeituraImagem | null {
  const valor = (raw as { nina_leitura_imagem?: unknown } | null)?.nina_leitura_imagem;
  return valor ? interpretarLeituraImagem(JSON.stringify(valor)) : null;
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();

/** Só uma nova imagem DEPOIS do pedido entregue vale como segunda tentativa. */
export function decidirFotos(entradas: MensagemFoto[], historico: MensagemFoto[]) {
  const fotos = entradas.filter(m => m.direction === "in" && m.tipo === "image");
  const falhas = fotos.filter(m => leituraSalvaDaFoto(m.raw)?.tipo === "ilegivel");
  if (falhas.length) {
    const ids = new Set(entradas.map(m => m.id));
    const anteriores = historico.filter(m => !ids.has(m.id));
    const pedido = anteriores.filter(m => m.direction === "out" && m.enviada_por === "nina" &&
      ["sent", "delivered", "read"].includes(m.status ?? "") && compacto(m.body ?? "") === compacto(PEDIR_NOVA_FOTO))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    const novaTentativa = pedido && falhas.some(m => Date.parse(m.created_at) > Date.parse(pedido.created_at));
    const leituraResolvida = pedido && anteriores.some(m => m.direction === "in" && m.tipo === "image" &&
      leituraSalvaDaFoto(m.raw)?.tipo === "pedido_medico" && Date.parse(m.created_at) > Date.parse(pedido.created_at));
    return { acao: novaTentativa && !leituraResolvida ? "encaminhar" : "nova_foto", motivo: FOTO_SEGUNDA_FALHA } as const;
  }
  if (fotos.some(m => ["outro", "receita_remedio"].includes(leituraSalvaDaFoto(m.raw)?.tipo ?? "")))
    return { acao: "encaminhar", motivo: "FOTO_REQUER_AVALIACAO_HUMANA" } as const;
  return { acao: "continuar", motivo: null } as const;
}
