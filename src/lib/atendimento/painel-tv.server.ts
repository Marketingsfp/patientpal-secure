import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { lerInicioCronometroPausa } from "./cronometro-pausa.server";
import { ehPerfilAdmin } from "./perfil-atendimento";

const PAGINA = 1000;

/** Mesmo perfil de telefonia do pool; administrador prevalece em vínculo duplo. */
export function idsTelefoniaTv(membros: readonly { user_id: string; role: string }[]) {
  const admins = new Set(membros.filter((m) => ehPerfilAdmin(m.role)).map((m) => m.user_id));
  return new Set(membros.filter((m) => m.role === "telefonia" && !admins.has(m.user_id)).map((m) => m.user_id));
}

export type EstadoTv = "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE";

export type AtendenteTv = {
  id: string;
  nome: string;
  estado: EstadoTv;
  inicioPausa: string | null;
  atribuidas: number;
  /** Instante de espera de cada conversa pendente atribuída (TV calcula a crítica). */
  esperas: string[];
  /** Conversas que esta pessoa resolveu hoje. */
  resolvidasHoje: number;
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

  // Mensagens de hoje (sem avisos internos nem homologação/testes): base de
  // "conversas hoje", tempo médio de resposta das atendentes, volume por hora
  // e de quem foram as respostas.
  const doDia = new Set<string>();
  const msgs: { conversa_id: string | null; direction: string | null; enviada_por: string | null; enviada_por_user_id: string | null; created_at: string }[] = [];
  let desde = 0;
  while (true) {
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("conversa_id, direction, enviada_por, enviada_por_user_id, created_at")
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .neq("status", "system")
      .gte("created_at", inicio)
      .lt("created_at", fimExclusivo)
      .order("created_at", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    msgs.push(...((data ?? []) as typeof msgs));
    if (!data || data.length < PAGINA) break;
    desde += PAGINA;
  }

  // Volume: mensagens recebidas de pacientes por hora (fuso de São Paulo).
  const horaBR = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" });
  const volumePorHora = Array.from({ length: 24 }, () => 0);
  // Tempo de resposta: da primeira mensagem do paciente ainda sem retorno até a
  // próxima mensagem de uma atendente. Resposta da Nina encerra o intervalo sem
  // contar (a métrica é só das atendentes).
  const inicioPendente = new Map<string, number>();
  const tempos: number[] = [];
  // Respostas enviadas hoje: atendente (tem usuário), Nina, ou automáticas
  // do sistema (lembretes, avisos de protocolo e afins).
  const respostas = { equipe: 0, nina: 0, automaticas: 0 };
  for (const m of msgs) {
    const conv = m.conversa_id;
    if (m.direction !== "in") {
      if (m.enviada_por_user_id) respostas.equipe++;
      else if (m.enviada_por === "nina") respostas.nina++;
      else respostas.automaticas++;
    }
    if (m.direction === "in") {
      volumePorHora[Number(horaBR.format(new Date(m.created_at))) % 24]++;
      if (conv && !inicioPendente.has(conv)) inicioPendente.set(conv, Date.parse(m.created_at));
    } else if (conv) {
      if (m.enviada_por_user_id) {
        doDia.add(conv);
        const ini = inicioPendente.get(conv);
        if (ini !== undefined) tempos.push(Date.parse(m.created_at) - ini);
      }
      inicioPendente.delete(conv);
    }
  }
  const tempoMedioRespostaSeg = tempos.length
    ? Math.round(tempos.reduce((s, v) => s + v, 0) / tempos.length / 1000)
    : null;

  // Do dia: conversas que a Nina passou para a equipe e conversas resolvidas
  // (com quem resolveu). Só contagens; nada de paciente sai daqui.
  const [encaminhadasHoje, resolvidasHoje] = await Promise.all([
    supabase
      .from("atend_conversas")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .gte("handoff_em", inicio)
      .lt("handoff_em", fimExclusivo),
    supabase
      .from("atend_conversas")
      .select("resolved_by")
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .gte("resolved_at", inicio)
      .lt("resolved_at", fimExclusivo)
      .limit(5000),
  ]);
  if (encaminhadasHoje.error) throw new Error(encaminhadasHoje.error.message);
  if (resolvidasHoje.error) throw new Error(resolvidasHoje.error.message);
  const resolvidasPor = new Map<string, number>();
  for (const r of resolvidasHoje.data ?? []) {
    if (r.resolved_by) resolvidasPor.set(r.resolved_by, (resolvidasPor.get(r.resolved_by) ?? 0) + 1);
  }

  const [esperas, presencas, membros] = await Promise.all([
    supabase.rpc("atend_espera_por_conversa", { _clinica_id: clinicaId, _is_teste: false }),
    supabase
      .from("atend_agente_presenca")
      .select("user_id, estado_manual, estado_manual_versao")
      .eq("clinica_id", clinicaId),
    supabase
      .from("clinica_memberships")
      .select("user_id, role")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
  ]);
  if (esperas.error) throw new Error(esperas.error.message);
  if (presencas.error) throw new Error(presencas.error.message);
  if (membros.error) throw new Error(membros.error.message);
  const ativos = idsTelefoniaTv(membros.data ?? []);

  const humanas = abertas.filter((c) => c.owner_type !== "AI");
  const idsHumanas = new Set(humanas.map((c) => c.id));
  const donoDe = new Map(humanas.map((c) => [c.id, c.atribuida_user_id]));
  const espera: string[] = [];
  const esperasPorAtendente = new Map<string, string[]>();
  for (const t of esperas.data ?? []) {
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
  ].filter((id) => ativos.has(id));
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
        resolvidasHoje: resolvidasPor.get(id) ?? 0,
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
    tempoMedioRespostaSeg,
    respostasMedidas: tempos.length,
    volumePorHora,
    respostas,
    encaminhadasHoje: encaminhadasHoje.count ?? 0,
    resolvidasHoje: (resolvidasHoje.data ?? []).length,
    atualizadoEm: new Date().toISOString(),
  };
}
