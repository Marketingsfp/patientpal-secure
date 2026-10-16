/**
 * Ligação de demonstração da Nina por voz (GPT-Live 1), pedido de 15/10/2026.
 *
 * A voz segue as mesmas instruções publicadas e as mesmas regras do turno do
 * WhatsApp; só o canal muda. Tudo é simulação: nada é agendado, encaminhado ou
 * enviado ao paciente. Arquivo compartilhado entre navegador e servidor.
 */

/** Sem linha em `clinica_feature_flags` = aba oculta e ligação recusada no servidor. */
export const FLAG_NINA_LIGACAO = "nina_ligacao_demo";

/** Chave da tela na matriz de permissões do OS ZAP (`permissoes-oszap.ts`). */
export const MODULO_LIGACAO = "nina-ligacao";

/** Vozes do GPT-Live 1 (`audio.output.voice`). */
export const VOZES_LIGACAO = [
  "marin",
  "quartz",
  "ripple",
  "vesper",
  "willow",
  "stone",
  "gleam",
  "meridian",
  "bossa",
  "tempo",
  "beacon",
  "delta",
  "cinder",
] as const;
export type VozLigacao = (typeof VOZES_LIGACAO)[number];
export const VOZ_PADRAO_LIGACAO: VozLigacao = "marin";

/** Preferência do navegador de quem usa a tela (não é dado compartilhado). */
export const CHAVE_VOZ_SALVA = "nina-ligacao:voz";

/** Valor salvo que não seja uma voz conhecida volta para a padrão. */
export function vozSalvaValida(valor: string | null | undefined): VozLigacao {
  return (VOZES_LIGACAO as readonly string[]).includes(valor ?? "")
    ? (valor as VozLigacao)
    : VOZ_PADRAO_LIGACAO;
}

/**
 * Ferramentas que gravam, identificam ou encaminham: na ligação respondem com
 * resultado simulado, sem tocar no banco. As demais são leituras reais do
 * catálogo publicado e da agenda.
 */
export const FERRAMENTAS_SIMULADAS_LIGACAO = [
  "selecionar_horario",
  "consultar_cadastro_paciente",
  "identificar_paciente",
  "meus_agendamentos",
  "agendar",
  "solicitar_atendente_humano",
  "solicitar_nome_atendimento",
] as const;

/** O que a tela mostra antes de ligar: de onde vieram as instruções. */
export type ResumoInstrucoesLigacao = {
  versaoPrompt: number | null;
  origemPrompt: "publicada" | "cache" | "codigo";
  podeAgendar: boolean;
  regras: string[];
  ferramentas: string[];
};
