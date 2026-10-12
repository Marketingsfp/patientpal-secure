import { hashDoTexto } from "./confidence/hash";
import { representacaoDaMensagem } from "./confidence/identidade-saida";
import { ROTULO_ESTADO_AVISO } from "./confidence/classificacao-saida";

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

    const avisosValidos = avisosOficiaisDaMensagem(m, avisos, data.clinicaId);
    const aviso = avisosValidos.length === 1 ? (avisosValidos[0] as Record<string, unknown>) : null;
    const execucaoConflitante =
      new Set(
        [m.execucao_id, ...avisosValidos.map((a) => a.execucao_id)].filter(
          (id) => typeof id === "string" && id,
        ),
      ).size > 1;

    const avisoOperacional = avisosValidos.length > 0;

    const estadoAviso = txt(aviso?.["estado"]);

    return {
      mensagemId,
      clinicaId: data.clinicaId,
      conversaId: txt(m.conversa_id),
      inspecionavel,
      execucaoId,
      ambiente: m["is_teste"] === true ? "homologacao" : "producao",
      classe: avisoOperacional ? "aviso_operacional" : "sem_avaliacao",
      explicacao: avisoOperacional
        ? "Aviso operacional registrado."
        : "Resposta da Nina registrada.",
      limitacao: execucaoConflitante ? "Vínculos de execução divergentes." : null,
      origem: aviso ? ORIGEM_ROTULO["aviso_encaminhamento"]! : null,
      textoEntregue,
      textoEntregueHash: hashEntregue,
      // O registro de entrega do motor de confiança foi desativado: sem vínculo.
      motivoSubstituicao: null,
      entrega: null,
      encaminhamento: aviso
        ? {
            protocolo: txt(aviso["protocolo"]),
            estado: estadoAviso,
            estadoRotulo: estadoAviso
              ? (ROTULO_ESTADO_AVISO[estadoAviso] ?? estadoAviso)
              : "Estado não registrado",
          }
        : null,
      avaliacoes: [],
      score: null,
      nivel: null,
    };
  });
}
