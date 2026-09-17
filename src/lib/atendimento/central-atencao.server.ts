import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { tipoFilaAtencao, type LinhaFila } from "./central-atencao";
import { nomeContato } from "./rotulo-conversa";

const TAMANHO_PAGINA = 500;

/** Apenas leitura autenticada: contagem completa, sem o recorte de 200 cards. */
export async function carregarDadosCentralAtencao(
  supabase: SupabaseClient<Database>,
  clinicaId: string,
  userId: string,
) {
  const { data: gestao, error: erroGestao } = await supabase.rpc("can_manage_clinica", {
    _clinica_id: clinicaId,
    _user_id: userId,
  });
  if (erroGestao) throw new Error(erroGestao.message);
  const gestor = gestao === true;

  async function carregarConversasVisiveis() {
    const conversas: LinhaFila[] = [];
    let depoisDe: string | null = null;
    while (true) {
      let query = supabase
        .from("atend_conversas")
        .select(
          "id, contato_nome, whatsapp_profile_name, contato_telefone, atribuida_user_id, fila_pendente, owner_type, status",
        )
        .eq("clinica_id", clinicaId)
        .eq("is_teste", false)
        .not("status", "in", "(closed,finished)")
        .order("id", { ascending: true })
        .limit(TAMANHO_PAGINA);
      // Mantém a privacidade da fila individual: atendentes veem só a própria
      // e as conversas da Nina que já podem acompanhar na Inbox.
      if (!gestor) query = query.or(`atribuida_user_id.eq.${userId},owner_type.eq.AI`);
      if (depoisDe) query = query.gt("id", depoisDe);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      conversas.push(...(data ?? []));
      if (!data || data.length < TAMANHO_PAGINA) break;
      const ultimo = data[data.length - 1].id;
      if (ultimo === depoisDe)
        throw new Error("Não foi possível concluir a consulta da Central de Atenção.");
      depoisDe = ultimo;
    }
    return conversas;
  }

  const [conversas, tempos, global] = await Promise.all([
    carregarConversasVisiveis(),
    supabase.rpc("atend_espera_por_conversa", { _clinica_id: clinicaId, _is_teste: false }),
    gestor
      ? Promise.resolve({ count: 0, error: null })
      : supabase
          .from("atend_conversas")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaId)
          .eq("is_teste", false)
          .not("status", "in", "(closed,finished)")
          .or("owner_type.is.null,owner_type.neq.AI")
          .is("atribuida_user_id", null),
  ]);
  if (tempos.error) throw new Error(tempos.error.message);
  if (global.error) throw new Error(global.error.message);

  const filas = conversas.filter((c) => tipoFilaAtencao(c) !== null);
  const atendentes = [
    ...new Set(filas.flatMap((c) => (c.atribuida_user_id ? [c.atribuida_user_id] : []))),
  ];
  const perfis = atendentes.length
    ? await supabase.from("profiles").select("id, nome").in("id", atendentes)
    : { data: [], error: null };
  if (perfis.error) throw new Error(perfis.error.message);
  const nomesAtendentes = new Map((perfis.data ?? []).map((p) => [p.id, p.nome]));
  const visiveis = new Set(conversas.map((c) => c.id));
  const espera: Record<string, string> = {};
  for (const t of tempos.data ?? []) {
    if (visiveis.has(t.conversa_id) && t.aguardando_desde)
      espera[t.conversa_id] = t.aguardando_desde;
  }

  return {
    filas: filas.map((c) => ({
      ...c,
      atendente_nome: c.atribuida_user_id
        ? (nomesAtendentes.get(c.atribuida_user_id) ?? null)
        : null,
    })),
    espera,
    nomes: Object.fromEntries(conversas.map((c) => [c.id, nomeContato(c)])),
    // O operacional acompanha o tamanho global sem receber dados dos pacientes
    // dessa fila nem ganhar permissão para abrir conversas fora do seu escopo.
    globalSemDetalhes: gestor ? 0 : (global.count ?? 0),
  };
}
