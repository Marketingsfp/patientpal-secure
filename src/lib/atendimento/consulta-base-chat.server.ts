import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR } from "@/lib/date-utils";
import { assertAcessoConversa } from "./acesso-conversa.server";
import {
  itensBaseChat,
  pesquisarBaseChat,
  textoBaseParaRascunho,
  type FonteConsultaChat,
  type SelecaoBaseChat,
} from "./consulta-base-chat";

export async function consultarBaseChatCore(
  db: SupabaseClient<Database>,
  userId: string,
  pedido: {
    clinicaId: string;
    conversaId: string;
    termo: string;
    pagina: number;
    registro?: SelecaoBaseChat;
  },
  lerFonte: (clinicaId: string) => Promise<FonteConsultaChat>,
) {
  await assertAcessoConversa(db, userId, pedido.clinicaId, pedido.conversaId);
  const fonte = await lerFonte(pedido.clinicaId);
  const itens = itensBaseChat(fonte, hojeBR());
  const consultadoEm = new Date().toISOString();
  if (pedido.registro) {
    const i = itens.find((i) => i.id === pedido.registro!.id && i.tipo === pedido.registro!.tipo);
    if (!i)
      throw Error("Este registro não está mais disponível na fonte atual. Pesquise novamente.");
    return {
      itens: [i],
      total: 1,
      pagina: 0,
      consultadoEm,
      texto: textoBaseParaRascunho(i, consultadoEm),
    };
  }
  return { ...pesquisarBaseChat(itens, pedido.termo, pedido.pagina), consultadoEm, texto: null };
}
