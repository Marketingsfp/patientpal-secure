/**
 * Assinatura dos avisos da Meta no webhook do WhatsApp (puro, sem banco).
 *
 * Regra: aviso com assinatura que não confere — ou clínica sem App Secret
 * configurado — é recusado antes de qualquer gravação ou chamada da Nina.
 * Sem isso, qualquer pessoa que conheça o endereço do webhook se passaria por
 * qualquer telefone. A Meta repete avisos recusados, então corrigir o App
 * Secret faz as mensagens retidas chegarem depois.
 *
 * Reversão: a variável de ambiente WHATSAPP_WEBHOOK_ASSINATURA=registrar
 * volta ao comportamento anterior (só registra e processa). Vale para todas
 * as clínicas; nunca é ajustada por clínica.
 */
export type ModoAssinaturaWebhook = "bloquear" | "registrar";

export function modoAssinaturaWebhook(
  valor: string | undefined = process.env.WHATSAPP_WEBHOOK_ASSINATURA,
): ModoAssinaturaWebhook {
  return String(valor ?? "")
    .trim()
    .toLowerCase() === "registrar"
    ? "registrar"
    : "bloquear";
}

export type DecisaoAssinaturaWebhook = {
  /** O aviso pode seguir para gravação e atendimento. */
  processar: boolean;
  /** Resultado para o log do webhook; `null` quando não há o que anotar. */
  resultado: string | null;
};

export function decidirAssinaturaWebhook(args: {
  appSecretConfigurado: boolean;
  assinaturaOk: boolean;
  modo: ModoAssinaturaWebhook;
}): DecisaoAssinaturaWebhook {
  if (args.appSecretConfigurado && args.assinaturaOk) return { processar: true, resultado: null };
  if (args.modo === "registrar") return { processar: true, resultado: "assinatura_invalida" };
  return {
    processar: false,
    resultado: args.appSecretConfigurado
      ? "erro:assinatura da Meta não confere (aviso recusado)"
      : "erro:App Secret não configurado (aviso recusado)",
  };
}
