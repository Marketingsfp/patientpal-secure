/** Contrato de autoria da inspeção. Vínculos vêm do banco, nunca do texto ou do cliente. */
export type MensagemInspecao = {
  id?: unknown;
  clinica_id?: unknown;
  conversa_id?: unknown;
  direction?: unknown;
  enviada_por?: unknown;
  status?: unknown;
  execucao_id?: unknown;
};

export type AvisoInspecao = {
  mensagem_id?: unknown;
  clinica_id?: unknown;
  conversa_id?: unknown;
  execucao_id?: unknown;
  turno_id?: unknown;
};

export function marcadorInternoSistema(mensagem: MensagemInspecao): boolean {
  return (
    mensagem.enviada_por === "sistema" &&
    (mensagem.status === "system" || mensagem.direction !== "out")
  );
}

/** Atualiza a leitura quando a execução/entrega chega após a primeira exibição da bolha. */
export function revisaoInspecaoMensagens(mensagens: readonly MensagemInspecao[]): string {
  return mensagens
    .filter(
      (m) => m.direction === "out" && (m.enviada_por === "nina" || m.enviada_por === "sistema"),
    )
    .map((m) => JSON.stringify([m.id, m.execucao_id ?? null, m.status ?? null]))
    .sort()
    .join(";");
}

export function avisosOficiaisDaMensagem(
  mensagem: MensagemInspecao,
  avisos: readonly AvisoInspecao[],
  clinicaId: string,
): AvisoInspecao[] {
  if (!mensagem.id || !mensagem.conversa_id || mensagem.clinica_id !== clinicaId) return [];
  return avisos.filter(
    (aviso) =>
      aviso.clinica_id === clinicaId &&
      aviso.conversa_id === mensagem.conversa_id &&
      aviso.mensagem_id === mensagem.id,
  );
}

export function mensagemNinaInspecionavel(
  mensagem: MensagemInspecao,
  avisos: readonly AvisoInspecao[] = [],
  clinicaId?: string,
): boolean {
  if (clinicaId && mensagem.clinica_id !== clinicaId) return false;
  if (mensagem.direction !== "out" || mensagem.status === "system") return false;
  if (mensagem.enviada_por === "nina") return true;
  return (
    mensagem.enviada_por === "sistema" &&
    Boolean(clinicaId) &&
    avisosOficiaisDaMensagem(mensagem, avisos, clinicaId!).length > 0
  );
}

/** IDs candidatos à leitura em lote. Ser candidato não autoriza reporte/inspeção. */
export function idsParaInspecaoNina(mensagens: readonly MensagemInspecao[]): string[] {
  return [
    ...new Set(
      mensagens
        .filter(
          (m) =>
            m.direction === "out" &&
            m.status !== "system" &&
            (m.enviada_por === "nina" || m.enviada_por === "sistema"),
        )
        .map((m) => String(m.id ?? ""))
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
}

export function execucaoOficialDaMensagem(
  mensagem: MensagemInspecao,
  avisos: readonly AvisoInspecao[],
  clinicaId: string,
): string | null {
  if (mensagem.clinica_id !== clinicaId) return null;
  const ids = [
    ...new Set(
      [
        mensagem.execucao_id,
        ...avisosOficiaisDaMensagem(mensagem, avisos, clinicaId).map((a) => a.execucao_id),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  return ids.length === 1 ? ids[0]! : null;
}
