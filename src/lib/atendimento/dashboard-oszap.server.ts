import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { janelaDiaClinica } from "@/lib/date-utils";
import {
  montarDashboardOsZap,
  type ConversaDashboard,
  type EventoDashboard,
  type ExecucaoNinaDashboard,
  type MensagemDashboard,
} from "./dashboard-oszap";
import {
  periodoComparacao,
  periodoDashboardSchema,
  type PeriodoDashboard,
} from "./dashboard-oszap-periodos";

const PAGINA = 1000;
type Resposta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
/** Sem truncar totais anuais em 20 mil linhas. Uma falha invalida a consulta inteira. */
export async function lerPaginasDashboard<T>(consulta: (de: number, ate: number) => Resposta<T>) {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const r = await consulta(de, de + PAGINA - 1);
    if (r.error)
      throw Error(
        "Não foi possível carregar todo o histórico. Tente novamente ou consulte um intervalo menor.",
      );
    linhas.push(...(r.data ?? []));
    if (!r.data || r.data.length < PAGINA) return linhas;
  }
}
/** Seções complementares: sem acesso ou falha, a seção some com aviso e o restante continua. */
async function opcional<T>(avisos: string[], aviso: string, ler: () => Promise<T>) {
  try {
    return await ler();
  } catch {
    avisos.push(aviso);
    return null;
  }
}
async function emLotes<T>(ids: string[], tamanho: number, ler: (lote: string[]) => Promise<T[]>) {
  const linhas: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho)
    linhas.push(...(await ler(ids.slice(i, i + tamanho))));
  return linhas;
}

const camposConversa =
  "id, created_at, status, departamento_id, atribuida_user_id, awaiting_patient_since, aguardando_desde, inbox_entrada_em, assigned_at, ultima_msg_em, unread_count, sentimento";
const camposMensagem =
  "id, created_at, conversa_id, direction, enviada_por, enviada_por_user_id, status";
// Somente o necessário: não lê conteúdo de mensagens, motivos, resumos clínicos nem telefones.
const camposEvento = "id, created_at, conversa_id, evento, user_id";
const EVENTOS = ["HANDOFF_SOLICITADO", "ENTROU_NA_FILA", "ASSUMIDA", "FINALIZADA", "TRANSFERIDA"];

/** Relatório de leitura para a gestão; não altera atendimento, fila nem presença. */
export async function carregarResumoDashboardOsZap(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  entrada: PeriodoDashboard,
) {
  const acesso = await db.rpc("can_manage_clinica", { _clinica_id: clinicaId, _user_id: userId });
  if (acesso.error || acesso.data !== true)
    throw Error("O dashboard de atendimento é destinado à administração e supervisão.");
  const periodo = periodoDashboardSchema.parse(entrada);
  const agora = new Date();
  const atualizadoEm = agora.toISOString();
  const inicio = janelaDiaClinica(periodo.de).inicio;
  const inicioAnterior = janelaDiaClinica(periodoComparacao(periodo).de).inicio;
  const fim = [janelaDiaClinica(periodo.ate).fimExclusivo, atualizadoEm].sort()[0];
  const avisos: string[] = [];

  const conversas = () =>
    db
      .from("atend_conversas")
      .select(camposConversa)
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false);
  const mensagens = () =>
    db
      .from("whatsapp_mensagens")
      .select(camposMensagem)
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  const eventos = () =>
    db
      .from("atend_conversa_eventos")
      .select(`${camposEvento}, atend_conversas!inner(is_teste)`)
      .eq("clinica_id", clinicaId)
      .eq("atend_conversas.is_teste", false)
      .in("evento", EVENTOS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

  const [abertas, criadas, msgs, evs] = await Promise.all([
    lerPaginasDashboard<ConversaDashboard>((de, ate) =>
      conversas().in("status", ["bot_attending", "waiting", "active"]).order("id").range(de, ate),
    ),
    lerPaginasDashboard<ConversaDashboard>((de, ate) =>
      conversas()
        .gte("created_at", inicioAnterior)
        .lt("created_at", fim)
        .order("id")
        .range(de, ate),
    ),
    lerPaginasDashboard<MensagemDashboard>((de, ate) =>
      mensagens().gte("created_at", inicioAnterior).lt("created_at", fim).range(de, ate),
    ),
    lerPaginasDashboard<EventoDashboard>((de, ate) =>
      eventos().gte("created_at", inicioAnterior).lt("created_at", fim).range(de, ate),
    ),
  ]);

  // Tempos de fila, resposta e encerramento podem terminar depois do fim do período.
  const acompanhadas = [
    ...new Set(
      evs
        .filter((e) => e.evento === "ENTROU_NA_FILA" || e.evento === "ASSUMIDA")
        .map((e) => e.conversa_id),
    ),
  ];
  const [seguintesEventos, seguintesMensagens] = await Promise.all([
    emLotes(acompanhadas, 100, (lote) =>
      lerPaginasDashboard<EventoDashboard>((de, ate) =>
        eventos().in("conversa_id", lote).gte("created_at", fim).range(de, ate),
      ),
    ),
    emLotes(acompanhadas, 100, (lote) =>
      lerPaginasDashboard<MensagemDashboard>((de, ate) =>
        mensagens()
          .in("conversa_id", lote)
          .eq("direction", "out")
          .in("status", ["sent", "delivered", "read"])
          .gte("created_at", fim)
          .range(de, ate),
      ),
    ),
  ]);

  const ler = async <T>(r: Resposta<T>) => {
    const { data, error } = await r;
    if (error) throw Error(error.message);
    return data ?? [];
  };
  const conversasReais = [
    ...new Set(msgs.map((m) => m.conversa_id).filter((id): id is string => !!id)),
  ];
  const [
    avaliacoes,
    transferencias,
    departamentos,
    presencas,
    pausas,
    motivosPausa,
    nina,
    francisco,
    webhook,
  ] = await Promise.all([
    lerPaginasDashboard<{ created_at: string; nota: number }>((de, ate) =>
      db
        .from("atend_avaliacoes")
        .select("created_at, nota, atend_conversas!inner(is_teste)")
        .eq("clinica_id", clinicaId)
        .eq("atend_conversas.is_teste", false)
        .gte("created_at", inicioAnterior)
        .lt("created_at", fim)
        .order("id")
        .range(de, ate),
    ),
    lerPaginasDashboard<{ created_at: string; para_departamento_id: string | null }>((de, ate) =>
      db
        .from("atend_transferencias")
        .select("created_at, para_departamento_id, atend_conversas!inner(is_teste)")
        .eq("clinica_id", clinicaId)
        .eq("atend_conversas.is_teste", false)
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .order("id")
        .range(de, ate),
    ),
    ler(
      db
        .from("atend_departamentos")
        .select("id, nome")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome"),
    ),
    ler(
      db
        .from("atend_agente_presenca")
        .select("user_id, status, estado_manual")
        .eq("clinica_id", clinicaId),
    ),
    lerPaginasDashboard<{
      user_id: string;
      reason_id: string | null;
      iniciada_em: string;
      finalizada_em: string | null;
    }>((de, ate) =>
      db
        .from("atend_pausas_log")
        .select("user_id, reason_id, iniciada_em, finalizada_em")
        .eq("clinica_id", clinicaId)
        .lt("iniciada_em", fim)
        .or(`finalizada_em.is.null,finalizada_em.gt.${inicio}`)
        .order("id")
        .range(de, ate),
    ),
    ler(db.from("atend_pause_reasons").select("id, nome").eq("clinica_id", clinicaId)),
    // Só execuções ligadas a conversas reais com mensagens no período: homologação e testes ficam fora.
    opcional(avisos, "Os números da Nina não puderam ser carregados.", () =>
      emLotes(conversasReais, 100, (lote) =>
        lerPaginasDashboard<ExecucaoNinaDashboard>((de, ate) =>
          db
            .from("nina_execucoes")
            .select(
              "created_at, conversation_id, success, handoff, latency_ms, input_tokens, output_tokens, model, perfil, error_category",
            )
            .eq("clinica_id", clinicaId)
            .in("conversation_id", lote)
            .gte("created_at", inicio)
            .lt("created_at", fim)
            .order("id")
            .range(de, ate),
        ),
      ),
    ),
    opcional(
      avisos,
      "Os envios do Francisco não aparecem: seu perfil não tem acesso ao Francisco.",
      () =>
        lerPaginasDashboard<{ etapa: string; status: string; respondido_em: string | null }>(
          (de, ate) =>
            db
              .from("francisco_envios")
              .select("etapa, status, respondido_em")
              .eq("clinica_id", clinicaId)
              .gte("created_at", inicio)
              .lt("created_at", fim)
              .order("id")
              .range(de, ate),
        ),
    ),
    opcional(avisos, "Os avisos da Meta (webhook) não puderam ser carregados.", () =>
      lerPaginasDashboard<{ recebido_em: string; resultado: string | null }>((de, ate) =>
        db
          .from("whatsapp_webhook_logs")
          .select("recebido_em, resultado")
          .eq("clinica_id", clinicaId)
          .gte("recebido_em", inicio)
          .lt("recebido_em", fim)
          .order("id")
          .range(de, ate),
      ),
    ),
  ]);

  const nomes = new Map<string, string>();
  const pessoas = [
    ...new Set(
      [
        ...presencas.map((p) => p.user_id),
        ...msgs.map((m) => m.enviada_por_user_id),
        ...evs.map((e) => e.user_id),
        ...abertas.map((c) => c.atribuida_user_id),
        ...pausas.map((p) => p.user_id),
      ].filter((id): id is string => !!id),
    ),
  ];
  try {
    const perfis = await emLotes(pessoas, 200, (lote) =>
      ler(db.from("profiles").select("id, nome").in("id", lote)),
    );
    for (const p of perfis) if (p.nome) nomes.set(p.id, p.nome);
  } catch {
    avisos.push(
      "Alguns nomes da equipe não puderam ser consultados; as contagens foram preservadas.",
    );
  }

  return {
    ...montarDashboardOsZap({
      periodo,
      agora,
      abertas,
      criadas,
      mensagens: msgs,
      eventos: evs,
      seguintes: { eventos: seguintesEventos, mensagens: seguintesMensagens },
      avaliacoes,
      transferencias,
      departamentos,
      presencas,
      pausas,
      motivosPausa,
      nomes,
      nina,
      francisco,
      webhook,
    }),
    inicio,
    fim,
    atualizadoEm,
    avisos,
  };
}
