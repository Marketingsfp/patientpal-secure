// Regras puras da fase 2 (documentos e financeiro) — testadas em regras-fase2.test.ts.

/** Link de download vale no máximo 5 minutos. */
export const LINK_VALIDADE_MIN = 5;

export type TipoLink = "documento" | "exame" | "recibo" | "nfse_pdf" | "nfse_xml";

/** Tipos que podem ir para o portal (contrato nunca). "exame" = resultado de exame. */
export const TIPOS_LIBERAVEIS = ["atestado", "receita", "laudo", "declaracao", "outro", "exame"] as const;
export type TipoLiberavel = (typeof TIPOS_LIBERAVEIS)[number];

export const NOME_TIPO: Record<string, string> = {
  atestado: "Atestado",
  receita: "Receita",
  laudo: "Laudo",
  declaracao: "Declaração",
  outro: "Outro documento (ex.: pedido de exame)",
  exame: "Resultado de exame",
};

export function tipoLiberavel(tipo: string | null | undefined): tipo is TipoLiberavel {
  return (TIPOS_LIBERAVEIS as readonly string[]).includes(tipo ?? "");
}

export function linkValido(expiraEm: string, agora: Date): boolean {
  return agora.getTime() < new Date(expiraEm).getTime();
}

export function expiraLink(agora: Date): string {
  return new Date(agora.getTime() + LINK_VALIDADE_MIN * 60_000).toISOString();
}

type Dono = { clinica_id: string; paciente_id: string | null };

/**
 * Segunda barreira (além do filtro da consulta): só fica o que é da clínica e
 * do paciente da sessão e, quando pedido, o que está liberado.
 */
export function somenteDoPaciente<T extends Dono & { liberado_paciente_em?: string | null }>(
  linhas: T[],
  sessao: { clinica_id: string; paciente_id: string },
  exigirLiberado: boolean,
): T[] {
  return linhas.filter(
    (l) =>
      l.clinica_id === sessao.clinica_id &&
      l.paciente_id === sessao.paciente_id &&
      (!exigirLiberado || !!l.liberado_paciente_em),
  );
}

/** Só baixa nota fiscal dos endereços do emissor (evita buscar endereço arbitrário). */
export function urlNfsePermitida(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "api.focusnfe.com.br" ||
      u.hostname === "focusnfe.s3.sa-east-1.amazonaws.com" ||
      u.hostname.endsWith(".focusnfe.com.br")
    );
  } catch {
    return false;
  }
}

/** Quantos documentos foram liberados depois do último acesso (null = primeiro acesso: todos). */
export function contarNovos(liberacoes: Array<string | null>, desde: string | null): number {
  const d = desde ? new Date(desde).getTime() : null;
  return liberacoes.filter((l) => !!l && (d === null || new Date(l).getTime() > d)).length;
}

const FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  convenio: "Convênio",
  cartao_proprio: "Cartão da clínica",
  boleto: "Boleto",
  transferencia: "Transferência",
};
export function nomeForma(f: string | null | undefined): string {
  if (!f) return "—";
  return FORMA[f] ?? f.replace(/_/g, " ");
}

/** Lançamento → situação mostrada ao paciente. */
export function situacaoPagamento(status: string): "pago" | "em_aberto" | "cancelado" {
  if (status === "confirmado") return "pago";
  if (status === "pendente") return "em_aberto";
  return "cancelado";
}
