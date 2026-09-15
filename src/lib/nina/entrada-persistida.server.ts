/** Mesma entrada física em retries dos dois transportes; nunca gerar para um insert falho. */
import { ErroAgrupamentoNina } from "./agrupamento-turno";
export async function registrarRevisaoEntradaNina(
  admin: any,
  entrada: {
    clinicaId: string;
    telefone: string;
    mensagemId: string;
  },
): Promise<number> {
  try {
    const { data, error } = await admin.rpc("nina_revisao_registrar_entrada", {
      _clinica_id: entrada.clinicaId,
      _telefone: entrada.telefone,
      _mensagem_id: entrada.mensagemId,
    });
    if (error || !Number.isSafeInteger(Number(data)) || Number(data) <= 0)
      throw new ErroAgrupamentoNina(
        `Revisão da entrada não confirmada: ${error?.message ?? "revisão inválida"}`,
      );
    return Number(data);
  } catch (e) {
    if (e instanceof ErroAgrupamentoNina) throw e;
    throw new ErroAgrupamentoNina(
      `Revisão da entrada não confirmada: ${String((e as Error)?.message ?? e)}`,
    );
  }
}
export async function persistirEntradaNina(
  admin: any,
  entrada: Record<string, unknown> & { clinica_id: string; wa_message_id: string },
) {
  try {
    const campos = "*";
    const { data, error } = await admin
      .from("whatsapp_mensagens")
      .insert(entrada)
      .select(campos)
      .maybeSingle();
    if (!error && data?.id) return { mensagem: data, repetida: false, consumida: false };
    if (error?.code !== "23505" && !/duplicate key/i.test(error?.message ?? ""))
      throw new ErroAgrupamentoNina(
        `Entrada não persistida: ${error?.message ?? "identificador não devolvido"}`,
      );
    const existente = await admin
      .from("whatsapp_mensagens")
      .select(campos)
      .eq("clinica_id", entrada.clinica_id)
      .eq("wa_message_id", entrada.wa_message_id)
      .maybeSingle();
    if (existente.error || !existente.data?.id || existente.data.direction !== "in")
      throw new ErroAgrupamentoNina(
        "Não foi possível recuperar a entrada persistida para conferir a duplicidade.",
      );
    const m = existente.data;
    if (
      String(m.from_number).replace(/\D/g, "") !== String(entrada.from_number).replace(/\D/g, "") ||
      (entrada.conversa_id && m.conversa_id !== entrada.conversa_id)
    )
      throw new ErroAgrupamentoNina(
        "A chave de entrada pertence a outra sessão; a mensagem anterior foi preservada.",
        false,
      );
    // Mídia sem texto não entra no lote de inferência. Só a primeira inserção pode
    // emitir o retorno automático; abandono fica explícito no watchdog, sem replay.
    const midiaSemLote =
      Boolean(m.nina_status) &&
      m.tipo !== "text" &&
      (m.tipo !== "audio" || !String(m.transcricao ?? "").trim());
    // A execução já começou: nunca repetir efeitos em busca de uma resposta ausente.
    return {
      mensagem: m,
      repetida: true,
      consumida: Boolean(
        m.execucao_id ||
        m.tratada_internamente ||
        midiaSemLote ||
        ["completed", "failed", "handoff"].includes(m.nina_status),
      ),
    };
  } catch (e) {
    if (e instanceof ErroAgrupamentoNina) throw e;
    throw new ErroAgrupamentoNina(`Entrada não persistida: ${String((e as Error)?.message ?? e)}`);
  }
}
