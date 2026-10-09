/**
 * Assinatura dos avisos da Meta no webhook do WhatsApp (puro, sem banco).
 *
 * Regra: aviso com assinatura que não confere — ou clínica sem App Secret
 * configurado — é recusado antes de gravar mensagens ou chamar a Nina.
 * Sem isso, qualquer pessoa que conheça o endereço do webhook se passaria por
 * qualquer telefone. O log técnico da tentativa continua permitido.
 * A autenticação é obrigatória em todas as clínicas e configurações.
 */
export type DecisaoAssinaturaWebhook = {
  /** O aviso pode seguir para gravação e atendimento. */
  processar: boolean;
  /** Resultado para o log do webhook; `null` quando não há o que anotar. */
  resultado: string | null;
};

export function decidirAssinaturaWebhook(args: {
  appSecretConfigurado: boolean;
  assinaturaOk: boolean;
}): DecisaoAssinaturaWebhook {
  if (args.appSecretConfigurado && args.assinaturaOk) return { processar: true, resultado: null };
  return {
    processar: false,
    resultado: args.appSecretConfigurado
      ? "erro:assinatura da Meta não confere (aviso recusado)"
      : "erro:App Secret não configurado (aviso recusado)",
  };
}
