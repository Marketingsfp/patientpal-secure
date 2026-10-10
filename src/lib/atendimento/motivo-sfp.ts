/** Explica a causa interna; não decide encaminhamento, destino ou aviso ao paciente. */
export const CAUSA_SFP_OUTRA_UNIDADE = "Consulta ou procedimento realizado em outra unidade (SFP).";

export function motivoIndicaSfp(motivo: string): boolean {
  const texto = motivo.trim().replace(/^\[[^\]]+\]\s*/, "");
  const codigo = /^([A-Z]+(?:_[A-Z]+)+)\b/i.exec(texto)?.[1]?.toUpperCase();
  // Uma menção a SFP no detalhe de urgência/cancelamento/etc. não troca a causa principal.
  if (codigo && !["CATALOGO_ATENDIMENTO_HUMANO", "PROFISSIONAL_SFP"].includes(codigo)) return false;
  return /(?:\b|_)SFP\b/i.test(texto);
}

/** Novos motivos preservam código e contexto, com a causa antes de detalhes longos. */
export function explicitarMotivoSfp(motivo: string): string {
  const semRotulo = motivo.trim().replace(/^\[[^\]]+\]\s*/, "");
  if (!motivoIndicaSfp(motivo) || /\boutra\s+unidade\b/i.test(semRotulo)) return motivo;
  const prefixo =
    /^(\s*(?:\[[^\]]+\]\s*)?(?:CATALOGO_ATENDIMENTO_HUMANO(?:\s*\/\s*PROFISSIONAL_SFP)?|PROFISSIONAL[_\s]+(?:[EÉ]\s+)?SFP))\b/i.exec(
      motivo,
    );
  const codigo = prefixo?.[1]?.trim() ?? "PROFISSIONAL_SFP";
  const detalhe = (prefixo ? motivo.slice(prefixo[0].length) : motivo).replace(/^[:.\s]+/, "");
  return `${codigo}: ${CAUSA_SFP_OUTRA_UNIDADE}${detalhe ? ` Detalhe: ${detalhe}` : ""}`;
}
