import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { janelaDiaClinica } from "@/lib/date-utils";
import {
  EVENTOS_DASHBOARD,
  resumirHistoricoDashboard,
  type MensagemHumanaDashboard,
  type EventoHistoricoDashboard,
} from "./dashboard-oszap";
import { periodoDashboardSchema, type PeriodoDashboard } from "./dashboard-oszap-periodos";

const PAGINA = 1000;
/** Sem truncar totais anuais em 20 mil linhas. Uma falha invalida a consulta inteira. */
export async function lerPaginasDashboard<T>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
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
const camposMensagem =
  "id, created_at, conversa_id, direction, enviada_por_user_id, enviada_por, status";
// Somente os campos necessários do evento: não lê resumo clínico, motivo ou conteúdo de mensagens.
const camposEvento =
  "id, created_at, conversa_id, evento, user_id, automatico:detalhes->automatico, protocol_number:detalhes->protocol_number, protocolo_informado:detalhes->protocolo_informado";

/** Relatório histórico de leitura; sem presença, estado atual da fila ou alterações no atendimento. */
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
  const inicio = janelaDiaClinica(periodo.de).inicio;
  const atualizadoEm = new Date().toISOString();
  const fim = [janelaDiaClinica(periodo.ate).fimExclusivo, atualizadoEm].sort()[0];
  const mensagensQuery = () =>
    db
      .from("whatsapp_mensagens")
      .select(camposMensagem)
      .eq("clinica_id", clinicaId)
      .eq("is_teste", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  const eventosQuery = () =>
    db
      .from("atend_conversa_eventos")
      .select(`${camposEvento}, atend_conversas!inner(is_teste)`)
      .eq("clinica_id", clinicaId)
      .eq("atend_conversas.is_teste", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  const [mensagensPeriodo, eventosPeriodo] = await Promise.all([
    lerPaginasDashboard((de, ate) =>
      mensagensQuery()
        .or("direction.eq.in,enviada_por.eq.humano,enviada_por_user_id.not.is.null")
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .range(de, ate),
    ),
    lerPaginasDashboard((de, ate) =>
      eventosQuery()
        .in("evento", ["FINALIZADA", "TRANSFERIDA"])
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .range(de, ate),
    ),
  ]);
  const ids = [
    ...new Set(
      [
        ...mensagensPeriodo.map((m) => m.conversa_id),
        ...eventosPeriodo.map((e) => e.conversa_id),
      ].filter((id): id is string => !!id),
    ),
  ];
  const mensagens: MensagemHumanaDashboard[] = [...mensagensPeriodo];
  const eventos: EventoHistoricoDashboard[] = [...eventosPeriodo];
  // Recupera o começo do ciclo mesmo quando anterior ao filtro. Não usa campos apagados na reabertura.
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const [historico, respostasAnteriores] = await Promise.all([
      lerPaginasDashboard((de, ate) =>
        eventosQuery()
          .in("conversa_id", lote)
          .in("evento", EVENTOS_DASHBOARD)
          .lt("created_at", fim)
          .range(de, ate),
      ),
      lerPaginasDashboard((de, ate) =>
        mensagensQuery()
          .in("conversa_id", lote)
          .eq("direction", "out")
          .or("enviada_por.eq.humano,enviada_por_user_id.not.is.null")
          .in("status", ["sent", "delivered", "read"])
          .lt("created_at", inicio)
          .range(de, ate),
      ),
    ]);
    for (const e of historico) eventos.push(e);
    for (const m of respostasAnteriores) mensagens.push(m);
  }
  const resumo = resumirHistoricoDashboard(mensagens, eventos, periodo);
  const avisos: string[] = [];
  const nomes = new Map<string, string>();
  const pessoasIds = resumo.pessoas.map((p) => p.id);
  for (let i = 0; i < pessoasIds.length; i += 200) {
    const r = await db
      .from("profiles")
      .select("id, nome")
      .in("id", pessoasIds.slice(i, i + 200));
    if (r.error) {
      avisos.push(
        "Alguns nomes da equipe não puderam ser consultados; as contagens por pessoa foram preservadas.",
      );
      break;
    }
    for (const p of r.data ?? []) if (p.nome) nomes.set(p.id, p.nome);
  }
  if (resumo.mensagens.recebidasSemHistorico)
    avisos.push(
      `${resumo.mensagens.recebidasSemHistorico} mensagem(ns) recebida(s) sem registro anterior que comprove a etapa humana ficaram fora do volume. Os totais representam apenas o histórico comprovado.`,
    );
  return {
    ...resumo,
    periodo,
    inicio,
    fim,
    atualizadoEm,
    avisos,
    pessoas: resumo.pessoas.map((p) => ({ ...p, nome: nomes.get(p.id) ?? "Nome não disponível" })),
  };
}
