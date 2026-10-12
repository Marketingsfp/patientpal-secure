/**
 * Cartão consulta (cartão de benefícios) é tratado exclusivamente pela equipe
 * humana — regra de negócio confirmada em 11/10/2026. Qualquer menção vai para
 * a equipe, inclusive preço com cartão; a Nina não responde sobre o cartão.
 *
 * "Cartão" sozinho é forma de pagamento (crédito/débito) e segue com a Nina.
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const MOTIVO_CARTAO_CONSULTA =
  "CARTAO_CONSULTA: o paciente mencionou o cartão consulta. Assuntos do cartão consulta são tratados exclusivamente pela equipe humana.";

export const REGRA_CARTAO_CONSULTA =
  "CARTAO-CONSULTA-01 — A Nina não trata assuntos do cartão consulta (cartão de benefícios, cartão de desconto, associado). Adesão, renovação, mensalidade, pagamento, cancelamento, segunda via, dependentes, benefícios e preços com cartão consulta são exclusivos da equipe humana. Quando o paciente mencionar o cartão consulta, chame imediatamente solicitar_atendente_humano com motivo iniciado por CARTAO_CONSULTA e resumo do pedido, sem informar valores, regras ou condições do cartão. Pagamento com cartão de crédito ou débito não é cartão consulta e segue o atendimento normal.";

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const CARTAO_CONSULTA =
  /\bcart(?:ao|oes)\s+(?:de\s+|da\s+|do\s+)?(?:consultas?|beneficios?|descontos?)\b/;
const ASSOCIADO = /\b(?:sou|somos|ser|virar|me\s+tornar|fazer\s+parte\s+como)\s+associad[oa]s?\b/;

/**
 * Menção explícita ao cartão consulta na mensagem do paciente.
 * Fallback conservador: funciona inclusive com o Jev desligado ou indisponível.
 */
export function mencionaCartaoConsulta(mensagem: string): boolean {
  if (!mensagem) return false;
  const texto = semAcento(mensagem);
  return CARTAO_CONSULTA.test(texto) || ASSOCIADO.test(texto);
}

/** Leitura do Jev para menções indiretas que as expressões fixas não alcançam. */
export function perguntaCartaoConsulta(): Record<string, PerguntaJev> {
  return {
    cartao_consulta: {
      type: "choice",
      instructions:
        "A mensagem atual do paciente trata do cartão consulta da clínica (cartão de benefícios, cartão ou plano de desconto próprio da clínica, carteirinha de associado)? Considere o histórico para referências como 'o meu plano de vocês' ou 'a carteirinha'. Pagamento com cartão de crédito ou débito, convênio ou plano de saúde de operadora não são cartão consulta.",
      criteria: {
        cartao_consulta:
          "Trata do cartão consulta: adesão, renovação, mensalidade, vencimento, segunda via, dependentes, benefícios ou preço com o cartão. Ex.: 'meu plano de vocês venceu', 'quero colocar minha mãe na carteirinha', 'como funciona aquele plano de desconto da clínica?', 'sou associada, quanto fica o exame?'.",
        nenhum:
          "Não trata do cartão consulta: pagamento com cartão de crédito/débito ('aceita cartão?'), pix, convênio, plano de saúde de operadora ou qualquer outro assunto.",
      },
    },
  };
}

export function cartaoConsultaPeloJev(r: RespostaJev | undefined): boolean {
  return typeof r?.confidence === "number" && r.confidence >= 0.8 && r.choice === "cartao_consulta";
}
