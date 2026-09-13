/**
 * O QUE É CADA BOLHA DA NINA (leitura para a tela de homologação e a Inbox).
 *
 * Responde, por mensagem entregue e sem adivinhar: é resposta avaliada, aviso
 * operacional do sistema, mensagem sem avaliação, ou texto alterado depois da
 * avaliação? E devolve o vínculo REAL (execução, entrega, encaminhamento) para
 * os detalhes técnicos.
 *
 * Nada é associado por horário próximo nem por semelhança de texto: só por
 * identificadores gravados (mensagem, execução, conversa) e por impressão
 * digital do conteúdo. Registro antigo e incompleto é declarado como tal.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { hashDoTexto } from "./confidence/hash";
import { selecionarAvaliacaoDaSaida, representacaoDaMensagem } from "./confidence/identidade-saida";
import {
  classificarSaida,
  ROTULO_ESTADO_AVISO,
  ROTULO_ESTADO_ENTREGA,
  type ClasseSaida,
} from "./confidence/classificacao-saida";

export type AvaliacaoDaSaidaView = {
  decisaoId: string | null;
  score: number | null;
  nivel: string | null;
  representacao: string | null;
  textoHash: string | null;
  criadoEm: string | null;
  /** Esta avaliação é do conteúdo realmente entregue nesta bolha? */
  desteTexto: boolean;
};

export type SaidaMensagemView = {
  mensagemId: string;
  execucaoId: string | null;
  ambiente: "producao" | "homologacao";
  classe: ClasseSaida;
  explicacao: string;
  limitacao: string | null;
  /** Origem declarada da mensagem (resposta da Nina, aviso do sistema…). */
  origem: string | null;
  textoEntregue: string | null;
  textoEntregueHash: string | null;
  /** Por que este texto substituiu o anterior, quando houve substituição. */
  motivoSubstituicao: string | null;
  entrega: { estado: string | null; representacao: string | null; transporteId: string | null } | null;
  encaminhamento: { protocolo: string | null; estado: string | null; estadoRotulo: string } | null;
  avaliacoes: AvaliacaoDaSaidaView[];
  /** Score aplicável a ESTE conteúdo (null quando não há vínculo conferido). */
  score: number | null;
  nivel: string | null;
};

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

export const saidasDasMensagens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid().nullable().optional(),
        mensagemIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<SaidaMensagemView[]> => {
    const { data: msgs, error: erroMsgs } = await context.supabase
      .from("whatsapp_mensagens")
      .select("id, body, tipo, transcricao, execucao_id, is_teste, canal, conversa_id")
      .eq("clinica_id", data.clinicaId)
      .in("id", data.mensagemIds);
    if (erroMsgs) throw new Error(erroMsgs.message);
    const linhas = (msgs ?? []) as unknown as Array<Record<string, unknown>>;
    if (linhas.length === 0) return [];

    const ids = linhas.map((m) => String(m["id"]));
    const execucoes = [
      ...new Set(linhas.map((m) => txt(m["execucao_id"])).filter((v): v is string => Boolean(v))),
    ];

    // Vínculos de entrega: estado, representação e detalhe (origem/motivo).
    const { data: vincRows } = await context.supabase
      .from("nina_confianca_vinculos")
      .select("outgoing_message_id, decisao_id, execucao_id, representacao, estado, texto_hash, transporte_id, detalhe, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("outgoing_message_id", ids)
      .order("created_at", { ascending: false });
    const vinculos = (vincRows ?? []) as unknown as Array<Record<string, unknown>>;

    // Avisos de encaminhamento: vínculo real com a mensagem entregue.
    const { data: avisoRows } = await context.supabase
      .from("atend_aviso_encaminhamento")
      .select("mensagem_id, protocolo, estado, ambiente, execucao_id, handoff_evento_id, texto_hash")
      .eq("clinica_id", data.clinicaId)
      .in("mensagem_id", ids);
    const avisos = (avisoRows ?? []) as unknown as Array<Record<string, unknown>>;

    // Avaliações do motor no escopo destes atendimentos.
    let decisoes: Array<Record<string, unknown>> = [];
    if (execucoes.length > 0) {
      const { data: decRows } = await context.supabase
        .from("nina_confianca_decisoes")
        .select("id, execucao_id, conversation_id, outgoing_message_id, representacao, texto_final_hash, score, nivel, created_at")
        .eq("clinica_id", data.clinicaId)
        .eq("avaliacao", "answer_confidence")
        .in("execucao_id", execucoes)
        .order("created_at", { ascending: false })
        .limit(200);
      decisoes = (decRows ?? []) as unknown as Array<Record<string, unknown>>;
    }

    return linhas.map((m): SaidaMensagemView => {
      const mensagemId = String(m["id"]);
      const execucaoId = txt(m["execucao_id"]);
      const identidade = representacaoDaMensagem({
        tipo: txt(m["tipo"]),
        texto: txt(m["body"]),
        transcricao: txt(m["transcricao"]),
      });
      const textoEntregue = identidade.conteudo;
      const hashEntregue = textoEntregue == null ? null : hashDoTexto(textoEntregue);

      const vinculo = vinculos.find((v) => String(v["outgoing_message_id"]) === mensagemId) ?? null;
      const detalhe = (vinculo?.["detalhe"] ?? null) as Record<string, unknown> | null;
      const aviso = avisos.find((a) => String(a["mensagem_id"]) === mensagemId) ?? null;

      const origemBruta = txt(detalhe?.["origem"]);
      const avisoOperacional =
        Boolean(aviso) || origemBruta === "aviso_encaminhamento" || detalhe?.["avaliada"] === false;

      // Candidatas do MESMO escopo. Sem mensagem/execução gravadas, nenhuma
      // avaliação é puxada por proximidade.
      const candidatas = decisoes
        .filter((d) => !execucaoId || String(d["execucao_id"]) === execucaoId)
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
        avaliacaoAplicavel: escolha.suficiente && !avisoOperacional,
        motivoVinculo: escolha.motivo,
      });

      const aplicada = classificacao.classe === "resposta_avaliada" ? escolha.avaliacao : null;
      const estadoAviso = txt(aviso?.["estado"]);

      return {
        mensagemId,
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
          desteTexto: Boolean(hashEntregue && c.textoHash && c.textoHash === hashEntregue),
        })),
        score: aplicada ? Math.round(Number(aplicada.linha["score"]) || 0) : null,
        nivel: aplicada ? txt(aplicada.linha["nivel"]) : null,
      };
    });
  });
