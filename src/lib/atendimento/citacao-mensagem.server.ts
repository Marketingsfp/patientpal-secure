import { citacoesFaltantes, type MensagemCitada } from "./citacao-mensagem";

/**
 * Citada fora da página carregada (mensagem antiga): busca só o trecho dela,
 * na mesma conversa, para a bolha mostrar o que foi respondido.
 */
export async function anexarCitacoes<T extends object>(
  // Cliente do usuário (RLS) com tipagem livre: as colunas lidas são fixas abaixo.
  supabase: any,
  clinicaId: string,
  conversaId: string,
  rows: T[],
): Promise<Array<T & { citacao?: MensagemCitada }>> {
  const citadaDe = (r: T) => {
    const q = (r as { quoted_message_id?: unknown }).quoted_message_id;
    return typeof q === "string" ? q : null;
  };
  const faltam = citacoesFaltantes(rows as Array<{ quoted_message_id?: unknown }>);
  if (!faltam.length) return rows;
  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("wa_message_id, direction, enviada_por, tipo, body")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .in("wa_message_id", faltam);
  // Sem o trecho, a bolha avisa que a citada não está disponível.
  if (error) return rows;
  const porId = new Map<string, MensagemCitada>(
    ((data ?? []) as MensagemCitada[]).map((c) => [c.wa_message_id, c]),
  );
  return rows.map((r) => {
    const id = citadaDe(r);
    const citacao = id ? porId.get(id) : undefined;
    return citacao ? { ...r, citacao } : r;
  });
}
