import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decidirFotos,
  PEDIR_NOVA_FOTO,
  FALHA_TECNICA_FOTO,
  CONFIRMAR_MARCACAO_FOTO,
  type MensagemFoto,
} from "./fotos";
import { criarResultado, criarResultadoSemNovaMensagem } from "./resposta/contrato";

/** Regra compartilhada antes do Jev, do modelo de conversa e de qualquer agendamento. */
export async function resolverFotosDoTurno(ctx: {
  clinicaId: string;
  conversaId: string | null;
  mensagensEntrada: string[];
  teste: boolean;
  desde: string;
  validar: () => Promise<unknown>;
  obsoleta?: () => Promise<boolean>;
}) {
  if (!ctx.conversaId || !ctx.mensagensEntrada.length) return null;
  const consulta = () => {
    const q = supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id,direction,tipo,body,transcricao,raw,created_at,status,enviada_por")
      .eq("clinica_id", ctx.clinicaId)
      .eq("conversa_id", ctx.conversaId!);
    return ctx.teste ? q.eq("is_teste", true) : q.or("is_teste.eq.false,is_teste.is.null");
  };
  const { data: entradas, error } = await consulta()
    .in("id", ctx.mensagensEntrada)
    .eq("tipo", "image");
  if (error) throw new Error("Não foi possível conferir as fotos do turno");
  if (!entradas?.length) return null;
  const primeira = entradas.map((m) => m.created_at).sort()[0]!;
  const { data: anteriores, error: erroHistorico } = await consulta()
    .gte("created_at", ctx.desde)
    .lte("created_at", primeira)
    .order("created_at", { ascending: false })
    .limit(200);
  if (erroHistorico) throw new Error("Não foi possível conferir a tentativa anterior da foto");
  const decisao = decidirFotos(entradas as MensagemFoto[], (anteriores ?? []) as MensagemFoto[]);
  if (decisao.acao === "continuar") return null;
  await ctx.validar();
  if (await ctx.obsoleta?.())
    return criarResultado({ origem: "midia", texto: "", estado: "descartar" });
  const { registrarEtapa } = await import("./evidencias.server");
  const { registrarOrigemResposta } = await import("./rastreio/turno.server");
  registrarOrigemResposta("codigo", "controle das tentativas de leitura de fotos");
  registrarEtapa({
    tipo: "consulta",
    fonte: "sistema",
    titulo: "Leitura de foto",
    dados: { acao: decisao.acao, motivo: decisao.motivo, mensagens: entradas.map((m) => m.id) },
  });
  if (decisao.acao === "falha_tecnica")
    return criarResultado({
      origem: "midia",
      texto: FALHA_TECNICA_FOTO,
      restricoes: ["falha_tecnica_na_foto", "nao_inferir_conteudo_da_foto"],
    });
  if (decisao.acao === "nova_foto")
    return criarResultado({
      origem: "midia",
      texto: PEDIR_NOVA_FOTO,
      restricoes: ["foto_nao_compreendida", "nao_inferir_conteudo_da_foto"],
    });
  if (decisao.acao === "confirmar_marcacao")
    return criarResultado({
      origem: "midia",
      texto: CONFIRMAR_MARCACAO_FOTO,
      restricoes: ["marcacao_da_foto_pendente", "nao_inferir_conteudo_da_foto"],
    });
  const { criarToolBroker } = await import("./tool-broker.server");
  const broker = criarToolBroker({
    ctxPaciente: null,
    executarPaciente: null,
    ctxHandoff: { clinicaId: ctx.clinicaId, conversaId: ctx.conversaId },
  });
  const r = await broker.executar(
    "solicitar_atendente_humano",
    JSON.stringify({
      motivo: decisao.motivo,
      resumo:
        decisao.motivo === "FOTO_REQUER_AVALIACAO_HUMANA"
          ? "Foto recebida fora da leitura administrativa de pedidos. A equipe precisa avaliar o anexo."
          : decisao.motivo === "FOTO_FALHA_TECNICA_PERSISTENTE"
            ? "O sistema não conseguiu processar a foto enviada mesmo após nova tentativa (falha técnica ou pedido com itens demais). Conferir as fotos anexadas à conversa."
            : "Não foi possível ler a nova foto enviada após a solicitação de uma imagem mais nítida. Conferir as fotos anexadas à conversa.",
      urgencia: "normal",
    }),
  );
  const aviso = (
    r.dados as {
      aviso?: import("../atendimento/aviso-encaminhamento").ResultadoAvisoEncaminhamento;
    } | null
  )?.aviso;
  if (r.success && aviso) {
    const { precisaAvisoDoChamador } = await import("../atendimento/aviso-encaminhamento");
    if (!precisaAvisoDoChamador(aviso))
      return criarResultadoSemNovaMensagem({
        estado: aviso.entregue ? "confirmado" : "envio_pendente",
        chaveOperacao: aviso.chave,
        mensagemId: aviso.mensagemId,
        protocolo: aviso.protocolo,
        texto: aviso.texto,
      });
  }
  return criarResultado({
    origem: "handoff",
    texto: r.success
      ? "Nossa equipe continuará o atendimento por aqui e poderá conferir a foto."
      : "Não consegui concluir o encaminhamento à equipe neste momento. Por favor, tente novamente em instantes.",
    acoesConcluidas: [
      {
        acao: "handoff",
        idempotencia: ctx.mensagensEntrada.join(":"),
        confirmada: r.success,
        evidencia: r.success ? ctx.conversaId : null,
      },
    ],
  });
}
