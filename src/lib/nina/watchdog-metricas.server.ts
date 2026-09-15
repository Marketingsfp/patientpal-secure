import { chaveMensagemCarga, controleExecucaoCarga } from "./carga-controle";
import { conciliarProcessamentoNina, percentil } from "./watchdog";

/** Conciliação de IDs reais do plano persistido. Não gera nem reenvia mensagens. */
export async function metricasWatchdogCarga(admin: any, carga: any, agora = Date.now()) {
  const plano = Array.isArray(carga.plano) ? carga.plano : [];
  if (!plano.length) return null;
  const chaves = plano.map(
    (p: any) => `test-${p.leadId}-${chaveMensagemCarga(carga.id, p.indice)}`,
  );
  let { data: mensagens, error } = await admin
    .from("whatsapp_mensagens")
    .select("id,conversa_id,wa_message_id,execucao_id,nina_status,nina_batch_id,created_at")
    .eq("clinica_id", carga.clinica_id)
    .eq("direction", "in")
    .in("wa_message_id", chaves);
  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ data: mensagens, error } = await admin
      .from("whatsapp_mensagens")
      .select("id,conversa_id,wa_message_id,execucao_id,created_at")
      .eq("clinica_id", carga.clinica_id)
      .eq("direction", "in")
      .in("wa_message_id", chaves));
  }
  if (error) throw new Error("WATCHDOG_METRICS_UNAVAILABLE");
  if (!carga.watchdog_ativo && !mensagens?.length) return null;
  // Projeção de leitura para testes legados: saída pending nunca comprova entrega.
  const semEstado = (mensagens ?? []).filter((m: any) => !m.nina_status);
  for (let inicio = 0; inicio < semEstado.length; inicio += 50) {
    const parte = semEstado.slice(inicio, inicio + 50);
    const consulta = () =>
      admin
        .from("whatsapp_mensagens")
        .select("id,conversa_id,wa_message_id,execucao_id")
        .eq("clinica_id", carga.clinica_id)
        .eq("direction", "out")
        .eq("is_teste", true)
        .eq("tipo", "text")
        .in("status", ["sent", "delivered", "read"]);
    const diretas = await consulta().in(
      "wa_message_id",
      parte.map((m: any) => `${m.wa_message_id}-reply`),
    );
    const execs = parte.map((m: any) => m.execucao_id).filter(Boolean);
    const vinculadas = execs.length
      ? await consulta().in("execucao_id", execs)
      : { data: [], error: null };
    if (diretas.error || vinculadas.error) throw new Error("CARGA_ENTREGA_INDISPONIVEL");
    const saidas = [...(diretas.data ?? []), ...(vinculadas.data ?? [])];
    for (const m of parte)
      if (
        saidas.some(
          (s) =>
            s.conversa_id === m.conversa_id &&
            (s.wa_message_id === `${m.wa_message_id}-reply` ||
              (m.execucao_id && s.execucao_id === m.execucao_id)),
        )
      )
        m.nina_status = "completed";
  }
  const resumo = conciliarProcessamentoNina(
    mensagens.map((m: any) => m.id),
    mensagens,
  );
  const encontradas = new Set(mensagens.map((m: any) => m.wa_message_id));
  const controle = controleExecucaoCarga(carga.config);
  let indicesRegistrados = plano.slice(0, Number(carga.enviadas ?? 0)).map((p: any) => p.indice);
  if (carga.config?.executor === "carga-v3-item") {
    const { data: amostras, error: erroAmostras } = await admin
      .from("nina_teste_carga_amostras")
      .select("indice")
      .eq("clinica_id", carga.clinica_id)
      .eq("carga_id", carga.id);
    if (erroAmostras) throw new Error("CARGA_RESULTADOS_INDISPONIVEIS");
    indicesRegistrados = (amostras ?? []).map((a: any) => a.indice);
  }
  const iniciados = new Set([
    ...indicesRegistrados,
    ...(controle.lease?.indices ?? []),
    ...controle.indicesIncertos,
  ]);
  const esperadas = chaves.filter(
    (c: string, i: number) => iniciados.has(plano[i].indice) || encontradas.has(c),
  );
  const naoLocalizadas = esperadas.filter((c: string) => !encontradas.has(c)).length;
  resumo.integridade = resumo.integridade && naoLocalizadas === 0;
  resumo.aprovado = resumo.aprovado && naoLocalizadas === 0;
  resumo.ausentes += naoLocalizadas;
  resumo.pendentes += naoLocalizadas;
  const ids = [...new Set(mensagens.map((m: any) => m.nina_batch_id).filter(Boolean))];
  let lotes: any[] = [],
    eventos: any[] = [];
  if (ids.length) {
    const [b, e] = await Promise.all([
      admin
        .from("nina_message_batches")
        .select(
          "id,conversa_id,watchdog_state,first_message_at,claimed_at,processamento_iniciado_em,processed_at,processing_deadline,attempt_count,recovered_count",
        )
        .eq("clinica_id", carga.clinica_id)
        .in("id", ids),
      admin
        .from("nina_trace_eventos")
        .select("node_id")
        .eq("clinica_id", carga.clinica_id)
        .in("trace_id", ids),
    ]);
    if (b.error || e.error) throw new Error("WATCHDOG_METRICS_UNAVAILABLE");
    lotes = b.data ?? [];
    eventos = e.data ?? [];
  }
  const conversas = [...new Set(mensagens.map((m: any) => m.conversa_id).filter(Boolean))];
  let orfaosLiberados = 0;
  if (conversas.length) {
    const { data: orfaos, error: eo } = await admin
      .from("nina_trace_eventos")
      .select("id")
      .eq("clinica_id", carga.clinica_id)
      .eq("node_id", "WATCHDOG_DETECTED_ORPHAN_LOCK")
      .in("conversation_id", conversas)
      .gte("started_at", carga.created_at);
    if (eo) throw new Error("WATCHDOG_METRICS_UNAVAILABLE");
    orfaosLiberados = orfaos?.length ?? 0;
  }
  const contar = (nome: string) => eventos.filter((e) => e.node_id === nome).length;
  const fila = lotes.flatMap((b) =>
    b.claimed_at
      ? [
          Math.max(
            0,
            Date.parse(b.processamento_iniciado_em ?? b.claimed_at) -
              Date.parse(b.first_message_at),
          ),
        ]
      : [],
  );
  const processamento = lotes.flatMap((b) =>
    b.watchdog_state === "completed" && b.processed_at && b.claimed_at
      ? [
          Math.max(
            0,
            Date.parse(b.processed_at) - Date.parse(b.processamento_iniciado_em ?? b.claimed_at),
          ),
        ]
      : [],
  );
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const prazo =
    Date.parse(carga.iniciado_em ?? carga.created_at) +
    Number(carga.config?.duracaoMaxS ?? 300) * 1000;
  const finalizado = Boolean(carga.finalizado_em) || agora >= prazo;
  return {
    ...resumo,
    esperadas: esperadas.length,
    semRastreamento: mensagens.filter((m: any) => !m.nina_status).length,
    naoLocalizadas,
    testeFalhou: finalizado && (!resumo.integridade || resumo.failed > 0),
    erroCritico: finalizado && !resumo.integridade,
    stale: lotes.filter(
      (b) => b.watchdog_state === "processing" && Date.parse(b.processing_deadline) <= agora,
    ).length,
    retrying: resumo.retry_pending,
    recovered_by_watchdog: lotes.reduce((n, b) => n + Number(b.recovered_count ?? 0), 0),
    duplicate_prevented: contar("DUPLICATE_PREVENTED"),
    watchdog_stale_jobs_detected: contar("WATCHDOG_DETECTED_STALE_JOB"),
    watchdog_jobs_recovered: lotes.filter(
      (b) => b.recovered_count > 0 && ["completed", "handoff"].includes(b.watchdog_state),
    ).length,
    watchdog_orphan_locks_released: orfaosLiberados,
    watchdog_retries: contar("WATCHDOG_REQUEUED_JOB") + contar("WATCHDOG_DELIVERY_RETRY"),
    watchdog_failed_recoveries: lotes.filter(
      (b) => b.recovered_count > 0 && b.watchdog_state === "failed",
    ).length,
    processing_timeout_count: contar("PROCESSING_TIMEOUT"),
    duplicate_prevention_count: contar("DUPLICATE_PREVENTED"),
    tempo_medio_fila_ms: media(fila),
    tempo_medio_processamento_ms: media(processamento),
    processamento_p95_ms: percentil(processamento, 0.95),
    processamento_p99_ms: percentil(processamento, 0.99),
    amostras_tempo: processamento.length,
  };
}
