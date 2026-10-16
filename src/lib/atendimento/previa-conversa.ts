/**
 * Prévia do card do OS ZAP (16/10/2026): o aviso de transferência para a equipe
 * ("Vou encaminhar… Protocolo do atendimento: MJ-912") sai em nome do sistema e
 * aparecia como mensagem enviada pela atendente. Ele não entra na prévia: o card
 * mostra a última mensagem de fato trocada, normalmente a do paciente.
 */
export function ehAvisoDeTransferencia(m: {
  direction: string | null;
  body: string | null;
}): boolean {
  return m.direction !== "in" && /(?:^|\n)\s*Protocolo do atendimento:\s*\S/.test(m.body ?? "");
}
