import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EVENTO_INBOX_ABERTA,
  entradaAtendimento,
  temAtribuicaoAberta,
  aplicarAberturaConfirmada,
  type ConversaNova,
} from "./conversa-nova";

/** Somente as conversas já autorizadas pela Inbox, com clínica explícita em toda consulta. */
export async function carregarAberturasInbox<T extends ConversaNova>(
  supabase: SupabaseClient<Database>,
  clinicaId: string,
  conversas: T[],
  userId?: string,
): Promise<(T & { inbox_aberta_user_id: string; inbox_aberta_entrada_em: string })[]> {
  const saida = conversas.map((c) => ({
    ...c,
    inbox_aberta_user_id: "",
    inbox_aberta_entrada_em: "",
  }));
  const alvos = saida.filter(temAtribuicaoAberta);
  if (!alvos.length) return saida;
  const ids = alvos.map((c) => c.id);
  const porId = new Map(alvos.map((c) => [c.id, c]));
  const inicio = alvos.map((c) => entradaAtendimento(c)!).sort()[0]!;

  // Compatibilidade com atendimentos que já foram abertos antes do selo existir.
  // Só a leitura do responsável atual após a entrada pode tirar o selo.
  const [operacionais, individuais, aberturas] = await Promise.all([
    supabase
      .from("atend_leitura_operacional")
      .select("conversa_id, user_id, read_at")
      .eq("clinica_id", clinicaId)
      .in("conversa_id", ids),
    userId
      ? supabase
          .from("atend_leituras")
          .select("conversa_id, user_id, read_at")
          .eq("clinica_id", clinicaId)
          .eq("user_id", userId)
          .in("conversa_id", ids)
      : Promise.resolve({ data: [], error: null }),
    (async () => {
      const aberturas: { conversa_id: string; user_id: string | null; detalhes: unknown }[] = [];
      // Paginação preservada, mas independente das leituras de compatibilidade.
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("atend_conversa_eventos")
          .select("conversa_id, user_id, detalhes")
          .eq("clinica_id", clinicaId)
          .eq("evento", EVENTO_INBOX_ABERTA)
          .in("conversa_id", ids)
          .gte("created_at", inicio)
          .in("user_id", [...new Set(alvos.map((c) => c.atribuida_user_id!))])
          .in("detalhes->>entrada_em", [...new Set(alvos.map((c) => entradaAtendimento(c)!))])
          .order("id", { ascending: true })
          .range(de, de + 999);
        if (error) throw new Error(error.message);
        aberturas.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) return aberturas;
      }
    })(),
  ]);
  if (operacionais.error) throw new Error(operacionais.error.message);
  if (individuais.error) throw new Error(individuais.error.message);
  for (const leitura of [...(operacionais.data ?? []), ...(individuais.data ?? [])]) {
    const c = porId.get(leitura.conversa_id);
    if (
      c &&
      leitura.user_id === c.atribuida_user_id &&
      (entradaAtendimento({ id: c.id, inbox_entrada_em: leitura.read_at }) ?? "") >=
        entradaAtendimento(c)!
    ) {
      Object.assign(
        c,
        aplicarAberturaConfirmada(c, {
          userId: leitura.user_id,
          entradaEm: entradaAtendimento(c)!,
        }),
      );
    }
  }
  for (const ev of aberturas) {
    const c = porId.get(ev.conversa_id);
    const entradaEm = (ev.detalhes as { entrada_em?: string } | null)?.entrada_em;
    if (c && ev.user_id && entradaEm) {
      Object.assign(c, aplicarAberturaConfirmada(c, { userId: ev.user_id, entradaEm }));
    }
  }
  return saida;
}

/** Acrescenta evidência; não modifica leituras anteriores, mensagens ou eventos históricos. */
export async function registrarAberturaInbox(
  supabase: SupabaseClient<Database>,
  clinicaId: string,
  userId: string,
  conversaId: string,
  entradaEm: string,
): Promise<{ marcada: boolean; userId: string; entradaEm: string }> {
  const { data: operacional, error: erroPerfil } = await supabase.rpc(
    "atend_permite_leitura_operacional",
    {
      _clinica_id: clinicaId,
    },
  );
  if (erroPerfil) throw new Error(erroPerfil.message);
  if (operacional !== true) return { marcada: false, userId, entradaEm };
  const { data: c, error } = await supabase
    .from("atend_conversas")
    .select("id, status, owner_type, is_teste, atribuida_user_id, inbox_entrada_em")
    .eq("clinica_id", clinicaId)
    .eq("id", conversaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !c ||
    !temAtribuicaoAberta(c) ||
    c.atribuida_user_id !== userId ||
    entradaAtendimento(c) !== entradaEm
  )
    return { marcada: false, userId, entradaEm };
  const { data: existente, error: erroConsulta } = await supabase
    .from("atend_conversa_eventos")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .eq("evento", EVENTO_INBOX_ABERTA)
    .eq("user_id", userId)
    .contains("detalhes", { entrada_em: entradaEm })
    .limit(1);
  if (erroConsulta) throw new Error(erroConsulta.message);
  if (!existente?.length) {
    const { error: erroInsert } = await supabase.from("atend_conversa_eventos").insert({
      clinica_id: clinicaId,
      conversa_id: conversaId,
      user_id: userId,
      evento: EVENTO_INBOX_ABERTA,
      detalhes: { entrada_em: entradaEm },
    });
    if (erroInsert) throw new Error(erroInsert.message);
  }
  // Se houver transferência concorrente, a evidência pertence ao ciclo antigo.
  // O consumidor confere usuário E entrada antes de baixar o selo.
  return { marcada: true, userId, entradaEm };
}
