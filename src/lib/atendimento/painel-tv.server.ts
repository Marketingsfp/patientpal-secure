import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { lerInicioCronometroPausa } from "./cronometro-pausa.server";

const PAGINA = 1000;

export type EstadoTv = "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE";

export type AtendenteTv = {
  id: string;
  nome: string;
  estado: EstadoTv;
  inicioPausa: string | null;
  atribuidas: number;
  /** Instante de espera de cada conversa pendente atribuída (TV calcula a crítica). */
  esperas: string[];
};

/**
 * Painel de TV do atendimento — só leitura, só gestão (can_manage_clinica).
 * Não devolve nome, telefone nem texto de paciente: apenas contagens e o
 * instante de espera de cada conversa (para a TV recalcular a faixa crítica).
 */
export async function carregarPainelTv(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  clinicaId: string,
  userId: string,
) {
  const { data: gestao, error: erroGestao } = await supabase.rpc("can_manage_clinica", {
    _clinica_id: clinicaId,
    _user_id: userId,
  });
  if (erroGestao) throw new Error(erroGestao.message);
  if (gestao !== true) throw new Error("Somente administração e supervisão podem abrir o painel da TV.");

  // Conversas abertas (todas as páginas).
  const abertas: { id: string; atribuida_user_id: string | null; owner_type: string | null }[] = [];

  let depois: string | null = null;
  while (true) {
    let q = supabase
      .from("atend_conversas")
      .select("id, atribuida_user_id, owner_type")
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .not("status", "in", "(closed,finished)")
      .order("id", { ascending: true })
      .limit(PAGINA);
    if (depois) q = q.gt("id", depois);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    abertas.push(...((data ?? []) as typeof abertas));
    if (!data || data.length < PAGINA) break;
    depois = data[data.length - 1].id;
  }

  const { inicio, fimExclusivo } = janelaDiaClinica(hojeBR());

  // Conversas do dia com atendente: alguém da equipe enviou mensagem hoje.
  const doDia = new Set<string>();
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("conversa_id")
      .eq("clinica_id", clinicaId)
      .not("enviada_por_user_id", "is", null)
      .neq("status", "system")
      .gte("created_at", inicio)
      .lt("created_at", fimExclusivo)
      .order("created_at", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    for (const m of data ?? []) if (m.conversa_id) doDia.add(m.conversa_id);
    if (!data || data.length < PAGINA) break;
    desde += PAGINA;
  }

  const [tempos, presencas, membros] = await Promise.all([
    supabase.rpc("atend_espera_por_conversa", { _clinica_id: clinicaId, _is_teste: false }),
    supabase
      .from("atend_agente_presenca")
      .select("user_id, estado_manual, estado_manual_versao")
      .eq("clinica_id", clinicaId),
    supabase
      .from("clinica_memberships")
      .select("user_id")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
  ]);
  if (tempos.error) throw new Error(tempos.error.message);
  if (presencas.error) throw new Error(presencas.error.message);
  if (membros.error) throw new Error(membros.error.message);
  const ativos = new Set((membros.data ?? []).map((m) => m.user_id));

  const humanas = abertas.filter((c) => c.owner_type !== "AI");
  const idsHumanas = new Set(humanas.map((c) => c.id));
  const donoDe = new Map(humanas.map((c) => [c.id, c.atribuida_user_id]));
  const espera: string[] = [];
  const esperasPorAtendente = new Map<string, string[]>();
  for (const t of tempos.data ?? []) {
    if (idsHumanas.has(t.conversa_id) && t.aguardando_desde) {
      espera.push(t.aguardando_desde);
      const dono = donoDe.get(t.conversa_id);
      if (dono) esperasPorAtendente.set(dono, [...(esperasPorAtendente.get(dono) ?? []), t.aguardando_desde]);
    }
  }

  const atribuidas = new Map<string, number>();
  for (const c of humanas) {
    if (c.atribuida_user_id)
      atribuidas.set(c.atribuida_user_id, (atribuidas.get(c.atribuida_user_id) ?? 0) + 1);
  }

  const estados = new Map<string, { estado: EstadoTv; versao: number }>();
  for (const p of presencas.data ?? []) {
    if (!ativos.has(p.user_id)) continue;
    const e = p.estado_manual;
    const estado: EstadoTv =
      e === "ONLINE" || e === "PAUSA" || e === "PAUSA_SAIDA" ? e : "OFFLINE";
    estados.set(p.user_id, { estado, versao: p.estado_manual_versao });
  }

  const ids = [
    ...new Set([
      ...[...estados.entries()].filter(([, v]) => v.estado !== "OFFLINE").map(([id]) => id),
      ...atribuidas.keys(),
    ]),
  ];
  const perfis = ids.length
    ? await supabase.from("profiles").select("id, nome").in("id", ids)
    : { data: [], error: null };
  if (perfis.error) throw new Error(perfis.error.message);
  const nomes = new Map((perfis.data ?? []).map((p) => [p.id, p.nome]));

  const atendentes: AtendenteTv[] = await Promise.all(
    ids.map(async (id) => {
      const st = estados.get(id) ?? { estado: "OFFLINE" as EstadoTv, versao: 0 };
      const pausa = st.estado === "PAUSA" || st.estado === "PAUSA_SAIDA";
      return {
        id,
        nome: nomes.get(id) || "Atendente sem nome",
        estado: st.estado,
        // Mesma leitura do cronômetro da sidebar e da Central (após validar gestão).
        inicioPausa: pausa
          ? ((await lerInicioCronometroPausa(admin, {
              clinicaId,
              userId: id,
              estado: st.estado as "PAUSA" | "PAUSA_SAIDA",
              versao: st.versao,
            })) ?? null)
          : null,
        atribuidas: atribuidas.get(id) ?? 0,
        esperas: esperasPorAtendente.get(id) ?? [],
      };
    }),
  );
  atendentes.sort((a, b) => b.atribuidas - a.atribuidas || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    atendentes,
    naoAtribuidas: humanas.filter((c) => !c.atribuida_user_id).length,
    emAndamento: humanas.length,
    comNina: abertas.length - humanas.length,
    espera,
    conversasDoDia: doDia.size,
    atualizadoEm: new Date().toISOString(),
  };
}
