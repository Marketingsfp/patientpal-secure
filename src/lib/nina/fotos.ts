import { interpretarLeituraImagem, type LeituraImagem } from "./leitura-imagem";

export const PEDIR_NOVA_FOTO =
  "Não consegui ler a foto com segurança.\n\nPode enviar outra foto mais nítida, com boa iluminação e o documento inteiro, sem cortes?";
export const FALHA_TECNICA_FOTO =
  "Recebi a foto, mas houve uma falha ao processá-la. Pode reenviar a mesma imagem para eu tentar novamente?";
export const CONFIRMAR_MARCACAO_FOTO =
  "Consegui ler os nomes na foto, mas não ficou claro quais exames estão marcados. Pode me dizer quais exames foram selecionados no pedido?";
export const FOTO_SEGUNDA_FALHA = "FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA";
export type MensagemFoto = {
  id: string;
  direction: string;
  tipo?: string | null;
  body?: string | null;
  transcricao?: string | null;
  raw?: unknown;
  created_at: string;
  status?: string | null;
  enviada_por?: string | null;
};
export function leituraSalvaDaFoto(raw: unknown): LeituraImagem | null {
  const valor = (raw as { nina_leitura_imagem?: unknown } | null)?.nina_leitura_imagem;
  if (valor && typeof valor === "object" && "tipo" in valor && valor.tipo === "falha_tecnica") {
    const motivo = "motivo" in valor ? valor.motivo : null;
    if (
      ["configuracao", "download", "provedor", "resposta_invalida", "limite_itens"].includes(
        String(motivo),
      )
    )
      return { tipo: "falha_tecnica", motivo } as LeituraImagem;
  }
  return valor ? interpretarLeituraImagem(JSON.stringify(valor)) : null;
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();

/** Respostas de mídia também apresentam a identidade publicada no primeiro contato. */
export function apresentarRespostaDeFoto(
  texto: string,
  obrigatoria: boolean,
  identidade: { assistente: string; estabelecimento: string } | null,
): string {
  if (!obrigatoria || !texto.trim()) return texto;
  const apresentacao = identidade
    ? `Olá! Me chamo ${identidade.assistente}, atendente virtual da ${identidade.estabelecimento}.`
    : "Olá! Sou a assistente virtual do atendimento.";
  return `${apresentacao}\n\n${texto}`;
}

/** Só uma nova imagem DEPOIS do pedido entregue vale como segunda tentativa. */
export function decidirFotos(entradas: MensagemFoto[], historico: MensagemFoto[]) {
  const fotos = entradas.filter((m) => m.direction === "in" && m.tipo === "image");
  const tecnicas = fotos.filter(
    (m) => leituraSalvaDaFoto(m.raw)?.tipo === "falha_tecnica" || !leituraSalvaDaFoto(m.raw),
  );
  if (tecnicas.length) {
    // Limite de itens se repete em qualquer reenvio: vai direto para a equipe.
    if (
      tecnicas.some(
        (m) => (leituraSalvaDaFoto(m.raw) as { motivo?: string } | null)?.motivo === "limite_itens",
      )
    )
      return { acao: "encaminhar", motivo: "FOTO_FALHA_TECNICA_PERSISTENTE" } as const;
    // Falha técnica depois de um pedido de reenvio já entregue: não repetir o pedido.
    const ids = new Set(entradas.map((m) => m.id));
    const aviso = historico
      .filter(
        (m) =>
          !ids.has(m.id) &&
          m.direction === "out" &&
          m.enviada_por === "nina" &&
          ["sent", "delivered", "read"].includes(m.status ?? "") &&
          compacto(m.body ?? "").endsWith(compacto(FALHA_TECNICA_FOTO)),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (aviso && tecnicas.some((m) => Date.parse(m.created_at) > Date.parse(aviso.created_at)))
      return { acao: "encaminhar", motivo: "FOTO_FALHA_TECNICA_PERSISTENTE" } as const;
    return { acao: "falha_tecnica", motivo: "FOTO_FALHA_TECNICA" } as const;
  }
  const falhas = fotos.filter((m) => leituraSalvaDaFoto(m.raw)?.tipo === "ilegivel");
  if (falhas.length) {
    const ids = new Set(entradas.map((m) => m.id));
    const anteriores = historico.filter((m) => !ids.has(m.id));
    const pedido = anteriores
      .filter(
        (m) =>
          m.direction === "out" &&
          m.enviada_por === "nina" &&
          ["sent", "delivered", "read"].includes(m.status ?? "") &&
          compacto(m.body ?? "").endsWith(compacto(PEDIR_NOVA_FOTO)),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    const novaTentativa =
      pedido && falhas.some((m) => Date.parse(m.created_at) > Date.parse(pedido.created_at));
    const leituraResolvida =
      pedido &&
      anteriores.some(
        (m) =>
          m.direction === "in" &&
          m.tipo === "image" &&
          leituraSalvaDaFoto(m.raw)?.tipo === "pedido_medico" &&
          Date.parse(m.created_at) > Date.parse(pedido.created_at),
      );
    return {
      acao: novaTentativa && !leituraResolvida ? "encaminhar" : "nova_foto",
      motivo: FOTO_SEGUNDA_FALHA,
    } as const;
  }
  if (fotos.some((m) => leituraSalvaDaFoto(m.raw)?.tipo === "marcacao_incerta"))
    return { acao: "confirmar_marcacao", motivo: "FOTO_MARCACAO_INCERTA" } as const;
  if (
    fotos.some((m) => ["outro", "receita_remedio"].includes(leituraSalvaDaFoto(m.raw)?.tipo ?? ""))
  )
    return { acao: "encaminhar", motivo: "FOTO_REQUER_AVALIACAO_HUMANA" } as const;
  return { acao: "continuar", motivo: null } as const;
}
