const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Não executa uma operação para cumprir uma promessa do modelo. Remove a
 * afirmação sem prova, preserva informações independentes e registra a correção. */
export function protegerEfeitosDaResposta(
  texto: string,
  fatos: {
    handoffConfirmado: boolean;
    bloqueioIdentificacao: boolean;
  },
) {
  let transferencia = false,
    bloqueio = false;
  const preservadas = texto
    .split(/\n\s*\n/)
    .map((bloco) =>
      bloco
        .split(/(?<!\bDr\.)(?<!\bDra\.)(?<=[.!])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕ])/)
        .filter((parte) => {
          const t = normalizar(parte).replace(/\*/g, "");
          const negativa =
            /\b(?:nao (?:consegui|foi|vou|estou|houve|sera|realizei)|sem (?:transferencia|encaminhamento))\b/.test(
              t,
            );
          const promessa =
            /\b(?:vou|vamos|irei|iremos|estou|estamos)\s+(?:agora\s+)?(?:te\s+|lhe\s+)?(?:encaminhar|transferir|direcionar|encaminhando|transferindo|direcionando)\b|\b(?:encaminhei|transferi|direcionei|encaminhamos|transferimos)\b|\b(?:voce|seu atendimento|sua conversa|sua solicitacao)\s+(?:ja\s+)?(?:foi|esta|sera)\s+(?:encaminhad[oa]|transferid[oa])\b/.test(
              t,
            ) ||
            // "a equipe/um atendente já vai responder/dar continuidade" também
            // anuncia uma transferência que precisa ter acontecido.
            /\b(?:equipe|setor|atendente|atendentes|recepcao)\b[^.!?]{0,80}?\b(?:ja|logo)\s+(?:vai|vao|ira|irao)\s+(?:te\s+|lhe\s+)?(?:responder|atender|dar continuidade|continuar|assumir|entrar em contato|falar)\b/.test(
              t,
            );
          if (!fatos.handoffConfirmado && !negativa && !t.includes("?") && promessa) {
            transferencia = true;
            return false;
          }
          if (
            fatos.bloqueioIdentificacao &&
            /\b(?:instabilidade tecnica|instabilidade no sistema)\b/.test(t)
          ) {
            bloqueio = true;
            return false;
          }
          return true;
        })
        .join(" "),
    )
    .filter(Boolean);
  if (!transferencia && !bloqueio) return { texto, alterado: false, transferenciaPrometida: false };
  const corpo = preservadas.filter(
    (p) =>
      !/^(?:(?:so|só) )?(?:um (?:momento|instante),? (?:por favor|so|só)?|aguarde(?: (?:so|só) )?(?: um (?:momento|instante))?)[.!\s]*(?:por favor[.!\s]*)?$/i.test(
        p.trim(),
      ),
  );
  if (bloqueio)
    corpo.push(
      "Ainda há uma identificação pendente em um dos pedidos; essa etapa precisa ser esclarecida para continuar.",
    );
  // A promessa sai sem aviso interno ao paciente ("o encaminhamento ainda não
  // foi realizado" vazou na homologação de 14/10/2026); quem chama decide se a
  // transferência prometida deve acontecer de fato.
  return { texto: corpo.join("\n\n"), alterado: true, transferenciaPrometida: transferencia };
}
