import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { tipoFilaAtencao, type LinhaFila } from "./central-atencao";
import { nomeContato } from "./rotulo-conversa";
import { lerInicioCronometroPausa } from "./cronometro-pausa.server";

const TAMANHO_PAGINA = 500;

/** Apenas leitura autenticada: contagem completa, sem o recorte de 200 cards. */
export async function carregarDadosCentralAtencao(
  supabase: SupabaseClient<Database>,
  clinicaId: string,
  userId: string,
  historicoGestao: SupabaseClient<Database> = supabase,
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

  async function carregarPausasVisiveis() {
    type Presenca = Pick<
      Database["public"]["Tables"]["atend_agente_presenca"]["Row"],
      "user_id" | "estado_manual_versao"
    >;
    const presencas: Presenca[] = [];
    let depoisDe: string | null = null;
    while (true) {
      let query = supabase
        .from("atend_agente_presenca")
        .select("user_id, estado_manual_versao")
        .eq("clinica_id", clinicaId)
        .eq("estado_manual", "PAUSA")
        .order("user_id", { ascending: true })
        .limit(TAMANHO_PAGINA);
      if (!gestor) query = query.eq("user_id", userId);
      if (depoisDe) query = query.gt("user_id", depoisDe);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      const membros = await supabase
        .from("clinica_memberships")
        .select("user_id")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in(
          "user_id",
          data.map((p) => p.user_id),
        );
      if (membros.error) throw new Error(membros.error.message);
      const ativos = new Set(membros.data?.map((m) => m.user_id));
      presencas.push(...data.filter((p) => ativos.has(p.user_id)));
      if (data.length < TAMANHO_PAGINA) break;
      depoisDe = data[data.length - 1].user_id;
    }
    const pausas: { atendenteId: string; inicio: string | null }[] = [];
    // Reutiliza a mesma leitura da sidebar, com concorrência limitada por clínica.
    for (let i = 0; i < presencas.length; i += 8) {
      pausas.push(
        ...(await Promise.all(
          presencas.slice(i, i + 8).map(async (p) => ({
            atendenteId: p.user_id,
            // Gestor pode acompanhar a equipe, mas o log bruto é restrito a admin/próprio.
            // Após can_manage_clinica, lê apenas o início das presenças já autorizadas
            // pela consulta autenticada. Nunca retorna o histórico ou remove seu RLS.
            inicio:
              (await lerInicioCronometroPausa(gestor ? historicoGestao : supabase, {
                clinicaId,
                userId: p.user_id,
                estado: "PAUSA",
                versao: p.estado_manual_versao,
              })) ?? null,
          })),
        )),
      );
    }
    return pausas;
  }

  const [conversas, tempos, global, pausas] = await Promise.all([
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
    carregarPausasVisiveis(),
  ]);
  if (tempos.error) throw new Error(tempos.error.message);
  if (global.error) throw new Error(global.error.message);

  const filas = conversas.filter((c) => tipoFilaAtencao(c) !== null);
  const atendentes = [
    ...new Set([
      ...filas.flatMap((c) => (c.atribuida_user_id ? [c.atribuida_user_id] : [])),
      ...pausas.map((p) => p.atendenteId),
    ]),
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
    pausas: pausas
      .map((p) => ({
        ...p,
        nome: nomesAtendentes.get(p.atendenteId) || "Atendente sem nome",
      }))
      .sort(
        (a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR") || a.atendenteId.localeCompare(b.atendenteId),
      ),
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
