/** Leitura autenticada pelo chamador. Nenhum registro de auditoria é reescrito. */
import {
  montarLeituraDetalhesMensagem,
  objetoDetalhes,
  textoDetalhes,
  type RegistroDetalhes,
} from "./detalhes-mensagem";

type Cliente = Pick<typeof import("@/integrations/supabase/client.server").supabaseAdmin, "from">;
type ResultadoConsulta = { data: unknown; error: { message: string } | null };
const EVENTOS =
  "id, clinica_id, trace_id, execution_id, conversation_id, message_id, cycle_id, node_id, event_type, status, duration_ms, started_at, finished_at, metadata";
const EXECUCAO =
  "id, clinica_id, conversation_id, mensagens_entrada, created_at, model, thinking_level, latency_ms, knowledge_status, tool_calls, success, error_category, handoff, input_tokens, output_tokens, retries, prompt_versao, prompt_origem, prompt_publicado_em, prompt_modulos";
const DECISAO =
  "id, clinica_id, execucao_id, conversation_id, outgoing_message_id, representacao, texto_final_hash, score, nivel, created_at, avaliacao, modo, decisao, motivos, reason_codes, bloqueadores";
const s = textoDetalhes;

export async function carregarDetalhesMensagem(
  db: Cliente,
  alvo: { clinicaId: string; mensagemId?: string; execucaoId?: string; conversaId?: string },
) {
  const alertas: string[] = [];
  const ler = async (
    consulta: PromiseLike<ResultadoConsulta>,
    nome: string,
  ): Promise<RegistroDetalhes[]> => {
    const r = await consulta;
    if (r.error) {
      alertas.push(`Não foi possível carregar ${nome}.`);
      return [];
    }
    return Array.isArray(r.data) ? r.data.map(objetoDetalhes) : [];
  };
  let mensagem: RegistroDetalhes | null = null;
  if (alvo.mensagemId) {
    const { data, error } = await db
      .from("whatsapp_mensagens")
      .select(
        "id, clinica_id, conversa_id, execucao_id, body, tipo, transcricao, status, created_at, canal, is_teste, direction, enviada_por",
      )
      .eq("clinica_id", alvo.clinicaId)
      .eq("id", alvo.mensagemId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar a mensagem selecionada.");
    if (!data)
      return {
        execucao: null,
        etapas: [],
        traceId: null,
        eventos: [],
        leitura: null,
        registrosComplementares: null,
      };
    mensagem = objetoDetalhes(data);
    if (mensagem.direction !== "out" || mensagem.enviada_por !== "nina")
      throw new Error("Selecione uma mensagem de saída da Nina.");
    if (alvo.conversaId && mensagem.conversa_id !== alvo.conversaId)
      throw new Error("A mensagem não pertence à conversa selecionada.");
  }
  const mensagemId = s(mensagem?.id);
  const conversaId = s(mensagem?.conversa_id) ?? alvo.conversaId ?? null;
  const [vinculosBrutos, avisosBrutos, eventosDiretos] = mensagemId
    ? await Promise.all([
        ler(
          db
            .from("nina_confianca_vinculos")
            .select(
              "id, clinica_id, conversation_id, outgoing_message_id, decisao_id, execucao_id, representacao, estado, texto_hash, transporte_id, detalhe, created_at",
            )
            .eq("clinica_id", alvo.clinicaId)
            .eq("outgoing_message_id", mensagemId)
            .order("created_at", { ascending: false })
            .limit(100),
          "os vínculos de entrega",
        ),
        ler(
          db
            .from("atend_aviso_encaminhamento")
            .select(
              "id, clinica_id, conversa_id, mensagem_id, protocolo, estado, ambiente, execucao_id, turno_id, handoff_evento_id, texto, texto_hash, transporte_id, updated_at",
            )
            .eq("clinica_id", alvo.clinicaId)
            .eq("mensagem_id", mensagemId)
            .limit(20),
          "o aviso operacional",
        ),
        ler(
          db
            .from("nina_trace_eventos")
            .select(EVENTOS)
            .eq("clinica_id", alvo.clinicaId)
            .eq("message_id", mensagemId)
            .order("started_at", { ascending: true })
            .limit(301),
          "os eventos da mensagem",
        ),
      ])
    : [[], [], []];
  const mesmaConversa = (r: RegistroDetalhes) =>
    !conversaId ||
    !(r.conversa_id ?? r.conversation_id) ||
    (r.conversa_id ?? r.conversation_id) === conversaId;
  const vinculos = vinculosBrutos.filter(mesmaConversa);
  const avisos = avisosBrutos.filter(mesmaConversa);
  if (vinculos.length !== vinculosBrutos.length || avisos.length !== avisosBrutos.length)
    alertas.push("Vínculos de outra conversa foram desconsiderados.");
  let execucaoId = s(mensagem?.execucao_id);
  if (!execucaoId && mensagem) {
    const vinculadas = [
      ...new Set(
        [
          ...vinculos.map((v) => s(v.execucao_id)),
          ...avisos.map((a) => s(a.execucao_id)),
          ...eventosDiretos.filter(mesmaConversa).map((e) => s(e.execution_id)),
        ].filter((v): v is string => v != null),
      ),
    ];
    if (vinculadas.length === 1) execucaoId = vinculadas[0]!;
    else if (vinculadas.length > 1)
      alertas.push(
        "Mais de uma execução está vinculada à mensagem; nenhuma foi escolhida automaticamente.",
      );
  }
  if (!mensagem) execucaoId = alvo.execucaoId ?? null;
  if (alvo.execucaoId && mensagem && execucaoId && alvo.execucaoId !== execucaoId)
    throw new Error("A execução não corresponde à mensagem selecionada.");
  if (mensagem && !execucaoId && alvo.execucaoId)
    alertas.push(
      "A execução informada não tem vínculo comprovado com a mensagem e não foi utilizada.",
    );
  let execucao: RegistroDetalhes | null = null;
  if (execucaoId) {
    const { data, error } = await db
      .from("nina_execucoes")
      .select(EXECUCAO)
      .eq("clinica_id", alvo.clinicaId)
      .eq("id", execucaoId)
      .maybeSingle();
    if (error) alertas.push("Não foi possível carregar a execução vinculada.");
    else if (data) {
      execucao = objetoDetalhes(data);
      if (!mesmaConversa(execucao))
        throw new Error("A execução não pertence à conversa selecionada.");
    }
  }
  const [evidencias, eventosExecucao] = execucao
    ? await Promise.all([
        ler(
          db
            .from("nina_execucao_evidencias")
            .select("etapas")
            .eq("clinica_id", alvo.clinicaId)
            .eq("execucao_id", String(execucao.id))
            .limit(1),
          "as evidências da execução",
        ),
        ler(
          db
            .from("nina_trace_eventos")
            .select(EVENTOS)
            .eq("clinica_id", alvo.clinicaId)
            .eq("execution_id", String(execucao.id))
            .order("started_at", { ascending: true })
            .limit(301),
          "o rastreamento da execução",
        ),
      ])
    : [[], []];
  const idsConhecidos = new Set<string>();
  const eventosConhecidos = [...eventosDiretos, ...eventosExecucao]
    .filter(mesmaConversa)
    .filter((e) => {
      const id = s(e.id);
      if (!id) return true;
      if (idsConhecidos.has(id)) return false;
      idsConhecidos.add(id);
      return true;
    });
  // O vínculo da mensagem tem precedência sobre traces auxiliares gravados
  // pelo gateway com o mesmo execution_id. Só a execução é fallback legado.
  const traceIdsDiretos = [
    ...new Set(
      [
        ...eventosDiretos.filter(mesmaConversa).map((e) => s(e.trace_id)),
        ...avisos.map((a) => s(a.turno_id)),
      ].filter((v): v is string => v != null),
    ),
  ];
  const traceIds = traceIdsDiretos.length
    ? traceIdsDiretos
    : [
        ...new Set(
          eventosExecucao
            .filter(mesmaConversa)
            .map((e) => s(e.trace_id))
            .filter((v): v is string => v != null),
        ),
      ];
  const traceId = traceIds.length === 1 ? traceIds[0]! : null;
  if (traceIds.length > 1)
    alertas.push(
      traceIdsDiretos.length
        ? "Os vínculos diretos da mensagem apontam para rastreamentos diferentes; nenhum foi escolhido como turno principal."
        : "Foram encontrados rastreamentos diferentes; não foram unidos em um turno único.",
    );
  let eventos = traceId ? eventosConhecidos.filter((e) => e.trace_id === traceId) : [];
  const eventosAuxiliares = eventosConhecidos.filter((e) => !traceId || e.trace_id !== traceId);
  if (traceId) {
    const todos = await ler(
      db
        .from("nina_trace_eventos")
        .select(EVENTOS)
        .eq("clinica_id", alvo.clinicaId)
        .eq("trace_id", traceId)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1001),
      "todas as etapas do turno",
    );
    if (todos.length) eventos = todos.filter(mesmaConversa);
    if (todos.length >= 1001)
      alertas.push(
        "O rastreamento excedeu o limite de leitura; algumas etapas podem não estar presentes.",
      );
  }
  const vistos = new Set<string>();
  eventos = eventos.filter((e) => {
    const id = s(e.id);
    if (!id) return true;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  const entradasIds = Array.isArray(execucao?.mensagens_entrada)
    ? execucao.mensagens_entrada.filter((v): v is string => typeof v === "string")
    : [];
  const decisoesIds = [
    ...new Set(vinculos.map((v) => s(v.decisao_id)).filter((v): v is string => v != null)),
  ];
  const [entradasBrutas, decisoesBrutas, decisoesMensagem, decisoesVinculo] = await Promise.all([
    entradasIds.length
      ? ler(
          db
            .from("whatsapp_mensagens")
            .select(
              "id, clinica_id, conversa_id, execucao_id, direction, body, transcricao, created_at",
            )
            .eq("clinica_id", alvo.clinicaId)
            .in("id", entradasIds)
            .eq("direction", "in")
            .order("created_at", { ascending: true }),
          "as mensagens de entrada vinculadas",
        )
      : Promise.resolve([]),
    execucao
      ? ler(
          db
            .from("nina_confianca_decisoes")
            .select(DECISAO)
            .eq("clinica_id", alvo.clinicaId)
            .eq("execucao_id", String(execucao.id))
            .order("created_at", { ascending: false })
            .limit(200),
          "as avaliações do motor",
        )
      : Promise.resolve([]),
    mensagemId
      ? ler(
          db
            .from("nina_confianca_decisoes")
            .select(DECISAO)
            .eq("clinica_id", alvo.clinicaId)
            .eq("outgoing_message_id", mensagemId)
            .order("created_at", { ascending: false })
            .limit(200),
          "as avaliações da mensagem",
        )
      : Promise.resolve([]),
    decisoesIds.length
      ? ler(
          db
            .from("nina_confianca_decisoes")
            .select(DECISAO)
            .eq("clinica_id", alvo.clinicaId)
            .in("id", decisoesIds)
            .order("created_at", { ascending: false })
            .limit(200),
          "as avaliações ligadas à entrega",
        )
      : Promise.resolve([]),
  ]);
  const entradas = entradasBrutas.filter(mesmaConversa);
  const idsDecisoes = new Set<string>();
  const decisoes = [...decisoesBrutas, ...decisoesMensagem, ...decisoesVinculo]
    .filter(mesmaConversa)
    .filter((d) => {
      const id = s(d.id);
      if (!id || idsDecisoes.has(id)) return false;
      idsDecisoes.add(id);
      return true;
    })
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)));
  const etapas = Array.isArray(evidencias[0]?.etapas)
    ? evidencias[0].etapas.map(objetoDetalhes)
    : [];
  const leitura = montarLeituraDetalhesMensagem({
    clinicaId: alvo.clinicaId,
    mensagem,
    execucao,
    entradas,
    etapas,
    eventos,
    decisoes,
    vinculos,
    avisos,
    alertas,
  });
  return {
    execucao,
    etapas,
    traceId,
    eventos,
    leitura,
    registrosComplementares: { mensagem, decisoes, avisos, vinculos, eventosAuxiliares },
  };
}
