const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Não executa uma operação para cumprir uma promessa do modelo. Remove a
 * afirmação sem prova, preserva informações independentes e registra a correção. */
export function protegerEfeitosDaResposta(texto: string, fatos: {
  handoffConfirmado: boolean; bloqueioIdentificacao: boolean;
}) {
  let transferencia = false, bloqueio = false;
  const preservadas = texto.split(/\n\s*\n/).map(bloco => bloco.split(/(?<!\bDr\.)(?<!\bDra\.)(?<=[.!])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕ])/).filter(parte => {
    const t = normalizar(parte).replace(/\*/g, "");
    const negativa = /\b(?:nao (?:consegui|foi|vou|estou|houve|sera|realizei)|sem (?:transferencia|encaminhamento))\b/.test(t);
    const promessa = /\b(?:vou|vamos|irei|iremos|estou|estamos)\s+(?:agora\s+)?(?:te\s+|lhe\s+)?(?:encaminhar|transferir|direcionar|encaminhando|transferindo|direcionando)\b|\b(?:encaminhei|transferi|direcionei|encaminhamos|transferimos)\b|\b(?:voce|seu atendimento|sua conversa|sua solicitacao)\s+(?:ja\s+)?(?:foi|esta|sera)\s+(?:encaminhad[oa]|transferid[oa])\b/.test(t);
    if (!fatos.handoffConfirmado && !negativa && !t.includes("?") && promessa) { transferencia = true; return false; }
    if (fatos.bloqueioIdentificacao && /\b(?:instabilidade tecnica|instabilidade no sistema)\b/.test(t)) { bloqueio = true; return false; }
    return true;
  }).join(" ")).filter(Boolean);
  if (!transferencia && !bloqueio) return { texto, alterado: false };
  const corpo = preservadas.filter(p => !/^(?:um momento,? por favor|aguarde(?: um momento)?)[.!\s]*$/i.test(p.trim()));
  if (bloqueio) corpo.push("Ainda há uma identificação pendente em um dos pedidos; essa etapa precisa ser esclarecida para continuar.");
  if (transferencia) corpo.push("O encaminhamento para a equipe ainda não foi realizado.");
  return { texto: corpo.join("\n\n"), alterado: true };
}
