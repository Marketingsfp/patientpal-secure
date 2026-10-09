import { filtrarMensagensExportacao, type PeriodoExportacao } from "./homologacao-exportacao";

export type MensagemExportacao = {
  id: string;
  created_at: string;
  direction: string;
  body: string | null;
  enviada_por: string | null;
  status: string | null;
};

/** Somente leitura; pagina independentemente do limite visual do console. */
export async function lerMensagensExportacao(
  admin: any,
  clinicaId: string,
  lead: { indice: number; conversa_id: string | null },
  periodo: PeriodoExportacao,
  ate = new Date().toISOString(),
): Promise<MensagemExportacao[]> {
  const tamanho = 500;
  const ids = new Set<string>();
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await admin
      .from("atend_conversas")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("is_teste", true)
      .like("contato_telefone", `5500${String(lead.indice).padStart(2, "0")}%`)
      .order("id")
      .range(inicio, inicio + tamanho - 1);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) ids.add(c.id);
    if ((data ?? []).length < tamanho) break;
  }
  if (lead.conversa_id) ids.add(lead.conversa_id);
  const conversas = [...ids];
  const mensagens = new Map<string, MensagemExportacao>();
  for (let bloco = 0; bloco < conversas.length; bloco += 100) {
    for (let inicio = 0; ; inicio += tamanho) {
      const { data, error } = await admin
        .from("whatsapp_mensagens")
        .select("id, created_at, direction, body, enviada_por, status")
        .eq("clinica_id", clinicaId)
        .in("conversa_id", conversas.slice(bloco, bloco + 100))
        .lte("created_at", ate)
        .order("created_at")
        .order("id")
        .range(inicio, inicio + tamanho - 1);
      if (error) throw new Error(error.message);
      // O calendário usa o mesmo fuso da conversa, inclusive nos limites do dia.
      for (const m of filtrarMensagensExportacao<MensagemExportacao>(data ?? [], periodo)) {
        mensagens.set(m.id, m);
      }
      if ((data ?? []).length < tamanho) break;
    }
  }
  return [...mensagens.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
