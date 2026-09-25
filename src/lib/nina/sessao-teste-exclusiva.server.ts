export class ErroSessaoTesteOcupada extends Error {
  constructor() {
    super("A sessão de teste está ocupada ou sendo reiniciada. Aguarde e reenvie a mensagem.");
    this.name = "ErroSessaoTesteOcupada";
  }
}

/** Serializa reset e entrada de mensagens, sem segurar a trava durante a IA. */
export async function comSessaoTesteExclusiva<T>(
  alvo: { clinicaId: string; leadId: string },
  executar: () => Promise<T>,
) {
  const { adquirirLockConversa, liberarLockConversa, lockConversaConfirmado } =
    await import("./lock-conversa.server");
  // Chave estável por lead: o telefone virtual muda justamente durante o reset.
  // Usa as RPCs persistentes existentes, com renovação e expiração do lease.
  const lock = await adquirirLockConversa({
    clinicaId: alvo.clinicaId,
    telefone: `homologacao-sessao:${alvo.leadId}`,
  });
  if (!lock) throw new ErroSessaoTesteOcupada();
  try {
    if (!lockConversaConfirmado(lock)) throw new ErroSessaoTesteOcupada();
    return await executar();
  } finally {
    await liberarLockConversa(lock);
  }
}
