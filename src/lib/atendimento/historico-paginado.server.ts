import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertAcessoConversa } from "./acesso-conversa.server";
import {
  filtroCursorHistorico,
  montarPaginaHistorico,
  TAMANHO_PAGINA_HISTORICO,
  type CursorHistorico,
  type EventoHistorico,
} from "./historico-paginado";

export async function carregarPaginaHistorico(
  supabase: SupabaseClient<Database>,
  userId: string,
  args: {
    clinicaId: string;
    conversaId: string;
    antes?: CursorHistorico;
    depois?: CursorHistorico;
  },
) {
  const membro = await supabase.rpc("is_member", { _user_id: userId, _clinica_id: args.clinicaId });
  if (membro.error) throw new Error(membro.error.message);
  if (!membro.data) throw new Error("Sem acesso a esta clínica");
  await assertAcessoConversa(supabase, userId, args.clinicaId, args.conversaId);
  const cursor = args.antes ?? args.depois;
  const sentido = args.depois ? "novas" : "anteriores";
  const crescente = sentido === "novas";
  let mensagens = supabase
    .from("whatsapp_mensagens")
    .select(
      "id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em, media_url, media_mime, status, execucao_id, client_message_id",
    )
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId);
  let eventos = supabase
    .from("atend_conversa_eventos")
    .select("id, evento, user_id, motivo, detalhes, created_at")
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId);
  if (cursor) {
    mensagens = mensagens.or(filtroCursorHistorico("mensagem", cursor, sentido));
    eventos = eventos.or(filtroCursorHistorico("evento", cursor, sentido));
  }
  // Uma linha extra detecta o fim sem COUNT(*) nem carregar o histórico inteiro.
  const [m, e] = await Promise.all([
    mensagens
      .order("recebida_em", { ascending: crescente })
      .order("id", { ascending: crescente })
      .limit(TAMANHO_PAGINA_HISTORICO + 1),
    eventos
      .order("created_at", { ascending: crescente })
      .order("id", { ascending: crescente })
      .limit(TAMANHO_PAGINA_HISTORICO + 1),
  ]);
  if (m.error) throw new Error(m.error.message);
  if (e.error) throw new Error(e.error.message);
  const pagina = montarPaginaHistorico(m.data ?? [], e.data ?? [], sentido);
  pagina.eventos = await preencherNomesEventos(supabase, pagina.eventos);
  return pagina;
}

export async function preencherNomesEventos(
  supabase: SupabaseClient<Database>,
  eventos: EventoHistorico[],
) {
  const ids = [
    ...new Set(
      eventos.flatMap((e) => {
        const det = e.detalhes as { para_user_id?: string; de_user_id?: string } | null;
        return [e.user_id, det?.para_user_id, det?.de_user_id].filter((id): id is string =>
          Boolean(id),
        );
      }),
    ),
  ];
  if (!ids.length) return eventos;
  const { data, error } = await supabase.from("profiles").select("id, nome").in("id", ids);
  if (error) throw new Error(error.message);
  const nomes = new Map(data?.map((p) => [p.id, p.nome]));
  return eventos.map((e) => {
    const det = e.detalhes as { para_user_id?: string; de_user_id?: string } | null;
    return {
      ...e,
      user_nome: nomes.get(e.user_id ?? "") ?? null,
      para_nome: nomes.get(det?.para_user_id ?? "") ?? null,
      de_nome: nomes.get(det?.de_user_id ?? "") ?? null,
    };
  });
}
