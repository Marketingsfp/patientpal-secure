import type { MensagemTimeline } from "./homologacao-realtime";

/** Só retoma uma entrada já persistida e explicitamente liberada pelo servidor. */
export async function enviarComRetomadaRecuperavel<T extends {
  recuperavel?: boolean; mensagemPersistida?: boolean;
}>(enviar: () => Promise<T>, atual: () => boolean,
  esperar = () => new Promise<void>((resolve) => setTimeout(resolve, 2500)),
): Promise<T> {
  let resultado = await enviar();
  for (let tentativa = 0; tentativa < 2 && resultado.recuperavel === true &&
    resultado.mensagemPersistida === true && atual(); tentativa++) {
    await esperar();
    if (!atual()) break;
    resultado = await enviar();
  }
  return resultado;
}

/** Uma resposta anterior ao envio atual nunca comprova sua recuperação. */
export function temRespostaAoEnvio(mensagens: MensagemTimeline[], waId: string): boolean {
  const entrada = mensagens.findIndex((m) => m.wa_message_id === waId &&
    m.direction === "in" && !m.id.startsWith("otimista:"));
  if (entrada < 0 || !mensagens[entrada].conversa_id) return false;
  return mensagens.slice(entrada + 1).some((m) => m.direction === "out" &&
    m.enviada_por === "nina" && m.conversa_id === mensagens[entrada].conversa_id);
}
