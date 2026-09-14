import { hashDoTexto } from "./confidence/hash";
import { selecionarAvaliacaoDaSaida, representacaoDaMensagem } from "./confidence/identidade-saida";
import {
  classificarSaida,
  ROTULO_ESTADO_AVISO,
  ROTULO_ESTADO_ENTREGA,
  type ClasseSaida,
} from "./confidence/classificacao-saida";

import type { SaidaMensagemView } from "./saida-mensagem.functions";
import {
  avisosOficiaisDaMensagem,
  execucaoOficialDaMensagem,
  mensagemNinaInspecionavel,
} from "./inspecao-mensagem";
const ORIGEM_ROTULO: Record<string, string> = {
  aviso_encaminhamento: "Aviso de encaminhamento (módulo de protocolo)",
  modelo: "Resposta do modelo",
  modelo_transformado: "Resposta do modelo, ajustada por regra",
  codigo: "Mensagem escrita pelo sistema",
  fallback_erro: "Mensagem de contingência por falha técnica",
};

function txt(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

export async function carregarSaidasDasMensagens(
  db: Pick<typeof import("@/integrations/supabase/client.server").supabaseAdmin, "from">,
  data: { clinicaId: string; conversaId?: string | null; mensagemIds: string[] },
): Promise<SaidaMensagemView[]> {
  let consulta = db
    .from("whatsapp_mensagens")
    .select(
      "id, clinica_id, direction, enviada_por, status, body, tipo, transcricao, execucao_id, is_teste, canal, conversa_id",
    )
    .eq("clinica_id", data.clinicaId)
    .in("id", data.mensagemIds);
  if (data.conversaId) consulta = consulta.eq("conversa_id", data.conversaId);
  const { data: msgs, error: erroMsgs } = await consulta;
  if (erroMsgs) throw new Error(erroMsgs.message);
  const linhas = ((msgs ?? []) as unknown as Array<Record<string, unknown>>).filter(
    (m) =>
      m.clinica_id === data.clinicaId && (!data.conversaId || m.conversa_id === data.conversaId),
  );
  if (linhas.length === 0) return [];

  const ids = linhas.map((m) => String(m["id"]));

  // Vínculos de entrega: estado, representação e detalhe (origem/motivo).
  const { data: vincRows, error: erroVinculos } = await db
    .from("nina_confianca_vinculos")
    .select(
      "clinica_id, conversation_id, outgoing_message_id, decisao_id, execucao_id, representacao, estado, texto_hash, transporte_id, detalhe, created_at",
    )
    .eq("clinica_id", data.clinicaId)
    .in("outgoing_message_id", ids)
    .order("created_at", { ascending: false });
  if (erroVinculos) throw new Error("Não foi possível carregar os vínculos de entrega.");
  const vinculos = (vincRows ?? []) as unknown as Array<Record<string, unknown>>;

  // Avisos de encaminhamento: vínculo real com a mensagem entregue.
  const { data: avisoRows, error: erroAvisos } = await db
    .from("atend_aviso_encaminhamento")
    .select(
      "clinica_id, conversa_id, mensagem_id, protocolo, estado, ambiente, execucao_id, turno_id, handoff_evento_id, texto_hash",
    )
    .eq("clinica_id", data.clinicaId)
    .in("mensagem_id", ids);
  if (erroAvisos) throw new Error("Não foi possível carregar os avisos operacionais.");
  const avisos = (avisoRows ?? []) as unknown as Array<Record<string, unknown>>;
  const execucoes = [
    ...new Set(
      linhas
        .filter((m) => mensagemNinaInspecionavel(m, avisos, data.clinicaId))
        .map((m) => execucaoOficialDaMensagem(m, avisos, data.clinicaId))
        .filter((id): id is string => id != null),
    ),
  ];

  // Avaliações do motor no escopo destes atendimentos.
  let decisoes: Array<Record<string, unknown>> = [];
  if (execucoes.length > 0) {
    const { data: decRows, error: erroDecisoes } = await db
      .from("nina_confianca_decisoes")
      .select(
        "id, clinica_id, execucao_id, conversation_id, outgoing_message_id, representacao, texto_final_hash, score, nivel, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("avaliacao", "answer_confidence")
      .in("execucao_id", execucoes)
      .order("created_at", { ascending: false })
      .limit(2001);
    if (erroDecisoes) throw new Error("Não foi possível carregar as avaliações do motor.");
    decisoes = (decRows ?? []) as unknown as Array<Record<string, unknown>>;
    if (decisoes.length >= 2001)
      throw new Error("As avaliações excederam o limite de leitura. A inspeção está incompleta.");
  }
  const { data: diretas, error: erroDiretas } = await db
    .from("nina_confianca_decisoes")
    .select(
      "id, clinica_id, execucao_id, conversation_id, outgoing_message_id, representacao, texto_final_hash, score, nivel, created_at",
    )
    .eq("clinica_id", data.clinicaId)
    .eq("avaliacao", "answer_confidence")
    .in("outgoing_message_id", ids)
    .order("created_at", { ascending: false })
    .limit(2001);
  if (erroDiretas) throw new Error("Não foi possível carregar as avaliações da mensagem.");
  if ((diretas ?? []).length >= 2001)
    throw new Error("As avaliações excederam o limite de leitura. A inspeção está incompleta.");
  decisoes = [...new Map([...decisoes, ...(diretas ?? [])].map((d) => [d.id, d])).values()];

  return linhas.map((m): SaidaMensagemView => {
    const mensagemId = String(m["id"]);
    const inspecionavel = mensagemNinaInspecionavel(m, avisos, data.clinicaId);
    const execucaoId = inspecionavel ? execucaoOficialDaMensagem(m, avisos, data.clinicaId) : null;
    const identidade = representacaoDaMensagem({
      tipo: txt(m["tipo"]),
      texto: txt(m["body"]),
      transcricao: txt(m["transcricao"]),
    });
    const textoEntregue = identidade.conteudo;
    const hashEntregue = textoEntregue == null ? null : hashDoTexto(textoEntregue);

    const vinculo =
      vinculos.find(
        (v) =>
          v.clinica_id === data.clinicaId &&
          v.conversation_id === m.conversa_id &&
          String(v["outgoing_message_id"]) === mensagemId,
      ) ?? null;
    const detalhe = (vinculo?.["detalhe"] ?? null) as Record<string, unknown> | null;
    const avisosValidos = avisosOficiaisDaMensagem(m, avisos, data.clinicaId);
    const aviso = avisosValidos.length === 1 ? (avisosValidos[0] as Record<string, unknown>) : null;
    const execucaoConflitante =
      new Set(
        [m.execucao_id, ...avisosValidos.map((a) => a.execucao_id)].filter(
          (id) => typeof id === "string" && id,
        ),
      ).size > 1;

    const origemBruta = txt(detalhe?.["origem"]);
    const avisoOperacional =
      avisosValidos.length > 0 ||
      origemBruta === "aviso_encaminhamento" ||
      detalhe?.["avaliada"] === false;

    // Candidatas do MESMO escopo. Sem mensagem/execução gravadas, nenhuma
    // avaliação é puxada por proximidade.
    const candidatas = decisoes
      .filter(
        (d) =>
          inspecionavel &&
          !execucaoConflitante &&
          d.clinica_id === data.clinicaId &&
          d.conversation_id === m.conversa_id &&
          (execucaoId
            ? String(d["execucao_id"]) === execucaoId
            : d.outgoing_message_id === mensagemId),
      )
      .map((d) => ({
        clinicaId: data.clinicaId,
        conversaId: txt(d["conversation_id"]),
        execucaoId: txt(d["execucao_id"]),
        outgoingMessageId: txt(d["outgoing_message_id"]),
        representacao: txt(d["representacao"]),
        textoHash: txt(d["texto_final_hash"]),
        linha: d,
      }));

    const escolha = selecionarAvaliacaoDaSaida(candidatas, {
      clinicaId: data.clinicaId,
      conversaId: txt(m["conversa_id"]) ?? data.conversaId ?? null,
      execucaoId,
      outgoingMessageId: mensagemId,
      representacao: identidade.representacao,
      conteudo: textoEntregue,
    });

    const classificacao = classificarSaida({
      carregou: true,
      avisoOperacional,
      temAvaliacao: candidatas.length > 0,
      avaliacaoAplicavel: escolha.suficiente && escolha.conteudoConferido && !avisoOperacional,
      motivoVinculo:
        escolha.motivo === "registro_antigo_sem_hash" ? "vinculo_incompleto" : escolha.motivo,
    });

    const aplicada = classificacao.classe === "resposta_avaliada" ? escolha.avaliacao : null;
    const estadoAviso = txt(aviso?.["estado"]);

    return {
      mensagemId,
      clinicaId: data.clinicaId,
      conversaId: txt(m.conversa_id),
      inspecionavel,
      execucaoId,
      ambiente: m["is_teste"] === true ? "homologacao" : "producao",
      classe: classificacao.classe,
      explicacao: classificacao.explicacao,
      limitacao: classificacao.limitacao,
      origem:
        (origemBruta ? (ORIGEM_ROTULO[origemBruta] ?? origemBruta) : null) ??
        (aviso ? ORIGEM_ROTULO["aviso_encaminhamento"]! : null),
      textoEntregue,
      textoEntregueHash: hashEntregue,
      motivoSubstituicao: txt(detalhe?.["motivo"]),
      entrega: vinculo
        ? {
            estado: (() => {
              const e = txt(vinculo["estado"]);
              return e ? (ROTULO_ESTADO_ENTREGA[e] ?? e) : null;
            })(),
            representacao: txt(vinculo["representacao"]),
            transporteId: txt(vinculo["transporte_id"]),
          }
        : null,
      encaminhamento: aviso
        ? {
            protocolo: txt(aviso["protocolo"]),
            estado: estadoAviso,
            estadoRotulo: estadoAviso
              ? (ROTULO_ESTADO_AVISO[estadoAviso] ?? estadoAviso)
              : "Estado não registrado",
          }
        : null,
      avaliacoes: candidatas.map((c) => ({
        decisaoId: txt(c.linha["id"]),
        score: c.linha["score"] == null ? null : Math.round(Number(c.linha["score"])),
        nivel: txt(c.linha["nivel"]),
        representacao: c.representacao,
        textoHash: c.textoHash,
        criadoEm: txt(c.linha["created_at"]),
        desteTexto: Boolean(!avisoOperacional && aplicada && aplicada.linha.id === c.linha.id),
      })),
      score: aplicada ? Math.round(Number(aplicada.linha["score"]) || 0) : null,
      nivel: aplicada ? txt(aplicada.linha["nivel"]) : null,
    };
  });
}
