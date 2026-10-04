import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR } from "@/lib/date-utils";
import { assertAcessoConversa } from "./acesso-conversa.server";
import {
  itensBaseChat,
  pesquisarBaseChat,
  type FonteConsultaChat,
  type ItemBaseChat,
} from "./consulta-base-chat";
import {
  MODELO_ESCRITA,
  mensagensEscrita,
  validarRespostaEscrita,
  type PedidoEscrita,
  type MensagemEscrita,
  type ResultadoEscrita,
} from "./assistente-escrita";

type Dependencias = {
  lerFonte: (clinicaId: string) => Promise<FonteConsultaChat>;
  gerar: (mensagens: ReturnType<typeof mensagensEscrita>) => Promise<string>;
};
/** Somente leitura e sugestão: este serviço não envia nem grava mensagens/rascunhos. */
export async function assistenteEscritaCore(
  db: SupabaseClient<Database>,
  userId: string,
  pedido: PedidoEscrita,
  deps: Dependencias,
): Promise<ResultadoEscrita> {
  await assertAcessoConversa(db, userId, pedido.clinicaId, pedido.conversaId);
  const inicio = Date.now();
  let historico: MensagemEscrita[] = [];
  const fontes: ItemBaseChat[] = [];
  let consultadoEm: string | null = null;
  if (pedido.acao === "sugerir") {
    // Só mensagens da conversa autorizada; nenhum prontuário, nota interna ou evento técnico.
    const { data, error } = await db
      .from("whatsapp_mensagens")
      .select("body, direction, enviada_por, recebida_em, id")
      .eq("clinica_id", pedido.clinicaId)
      .eq("conversa_id", pedido.conversaId)
      .order("recebida_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(16);
    if (error) throw Error("Não foi possível consultar o histórico. Tente novamente.");
    historico = (data ?? [])
      .filter((m) => m.enviada_por !== "sistema" && m.body?.trim())
      .reverse()
      .map((m) => ({
        autor:
          m.direction === "in" ? "Paciente" : m.enviada_por === "humano" ? "Atendente" : "Nina",
        texto: (m.body ?? "").slice(0, 1000),
      }));
    if (!historico.length)
      throw Error("Ainda não há mensagens de texto nesta conversa para sugerir uma resposta.");
    const fonte = itensBaseChat(await deps.lerFonte(pedido.clinicaId), hojeBR());
    // Recuperação limitada, sem truncar condições dentro de um registro. Não assume que o primeiro é o correto.
    const termos = pedido.assunto
      ? [pedido.assunto]
      : historico
          .filter((m) => m.autor === "Paciente")
          .slice(-3)
          .reverse()
          .map((m) => m.texto.slice(0, 120));
    const candidatos = termos.flatMap((t) => pesquisarBaseChat(fonte, t, 0).itens);
    let caracteres = 0;
    for (const f of candidatos) {
      if (fontes.some((i) => i.id === f.id && i.tipo === f.tipo)) continue;
      const tamanho = JSON.stringify(f).length;
      if (fontes.length >= 8 || caracteres + tamanho > 18000) continue;
      fontes.push(f);
      caracteres += tamanho;
    }
    consultadoEm = new Date().toISOString();
  }
  const raw = await deps.gerar(mensagensEscrita(pedido, historico, fontes));
  const resultado = validarRespostaEscrita(raw, pedido, fontes);
  // Uma mudança de acesso enquanto a IA respondia não pode devolver contexto de outra fila.
  await assertAcessoConversa(db, userId, pedido.clinicaId, pedido.conversaId);
  return { ...resultado, modelo: MODELO_ESCRITA, consultadoEm, duracaoMs: Date.now() - inicio };
}

// Limite local de concorrência e frequência. Não substitui o limite global do gateway.
const pedidosEmCurso = new Map<string, { emCurso: boolean; inicio: number }>();
export async function comLimiteEscrita<T>(userId: string, executar: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  for (const [id, v] of pedidosEmCurso)
    if (!v.emCurso && agora - v.inicio > 60000) pedidosEmCurso.delete(id);
  const anterior = pedidosEmCurso.get(userId);
  if (anterior && (anterior.emCurso || agora - anterior.inicio < 2000))
    throw Error("Aguarde a revisão em andamento antes de solicitar outra.");
  pedidosEmCurso.set(userId, { emCurso: true, inicio: agora });
  try {
    return await executar();
  } finally {
    pedidosEmCurso.set(userId, { emCurso: false, inicio: Date.now() });
  }
}
