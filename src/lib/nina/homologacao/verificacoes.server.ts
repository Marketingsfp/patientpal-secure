/**
 * FASE 4 — núcleo server-only das duas verificações da homologação.
 *
 * A. Verificação de FONTE:
 *      publica pelo caminho REAL (RPC `nina_instrucoes_publicar`) num escopo
 *      ISOLADO (`homologacao`, nunca lido pelo atendimento), resolve pelo
 *      resolvedor publicado e chama o gateway REAL. Nada de prompt temporário
 *      injetado só na requisição — isso não provaria o caminho de publicação.
 *
 * B. Verificação de ATENDIMENTO COMPLETO:
 *      roda o pipeline normal da homologação (mesmas políticas de confiança e
 *      finalização) e devolve, separadamente, o que o modelo produziu e o que
 *      sobrou depois das intervenções.
 *
 * Nenhuma ferramenta é declarada na verificação de fonte: ela não pode
 * agendar, cancelar, transferir nem enviar nada.
 */
import { comporRequestNina } from "@/lib/nina/prompt-composer";
import {
  resolverPrecedencia,
  textoContratoPrecedencia,
  resumoPrecedencia,
  REGRA_SAUDACAO,
  type RestricaoEstruturada,
} from "@/lib/nina/prompt/precedencia";
import {
  decidirModoTecnico,
  excecoesDaVerificacaoDeFonte,
  CANAL_HOMOLOGACAO,
} from "@/lib/nina/homologacao/modo-tecnico";
import {
  ESCOPO_DA_PROVA_FONTE,
  avaliarAderenciaFonte,
  regraPublicavelDoPar,
  resumirAtendimentoCompleto,
  type ParMarcador,
  type ResultadoAtendimentoCompleto,
  type ResultadoVerificacaoFonte,
} from "@/lib/nina/homologacao/verificacoes";

/** Regra geral publicada que a exceção de verificação pode suprimir. */
const REGRA_GERAL_SAUDACAO: RestricaoEstruturada = {
  codigo: REGRA_SAUDACAO,
  nivel: "regra_geral",
  origem: "comportamento publicado",
  descricao: "apresentação obrigatória na primeira mensagem da sessão",
  texto:
    "Na primeira mensagem da sessão, a resposta começa com a apresentação da assistente.",
};

async function hashTexto(texto: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

/**
 * Publica a regra do par pelo caminho oficial, no escopo isolado.
 * Usa o client AUTENTICADO: a RPC continua exigindo administrador.
 */
export async function publicarRegraDeFonte(
  supabase: any,
  par: ParMarcador,
): Promise<{ versao: number | null; versaoId: string | null }> {
  const conteudo = regraPublicavelDoPar(par);
  const { data, error } = await supabase.rpc("nina_instrucoes_publicar", {
    p_escopo: "homologacao",
    p_conteudo: conteudo,
    p_comentario: `verificação de fonte (${par.id})`,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const { invalidarCacheInstrucoes } = await import("@/lib/nina/instrucoes-runtime.server");
  invalidarCacheInstrucoes("homologacao");
  return {
    versao: (row?.versao ?? null) as number | null,
    versaoId: (row?.id ?? null) as string | null,
  };
}

export type EntradaVerificacaoFonte = {
  clinicaId: string;
  par: ParMarcador;
  /** Client autenticado do usuário que pediu a verificação. */
  supabase: any;
};

/**
 * Executa UM par: publica, resolve pela versão publicada, monta o payload com
 * o contrato de precedência e chama o modelo de verdade.
 */
export async function verificarFonteEAderencia(
  e: EntradaVerificacaoFonte,
): Promise<ResultadoVerificacaoFonte> {
  const base: ResultadoVerificacaoFonte = {
    parId: e.par.id,
    marcador: e.par.marcador,
    versao: null,
    versaoId: null,
    origemVersao: "nao_resolvida",
    fallbackPorErro: false,
    regraChegouAoPayload: false,
    primeiraRespostaCumpriu: false,
    hashPayload: null,
    modelo: null,
    erro: null,
    escopoDaProva: ESCOPO_DA_PROVA_FONTE,
  };

  // O modo técnico é decidido AQUI, no servidor, e nunca pelo texto enviado.
  const modo = decidirModoTecnico({
    ambiente: "homologacao",
    canal: CANAL_HOMOLOGACAO,
    autorizadoPeloServidor: true,
  });
  if (!modo.ativo) return { ...base, erro: `modo técnico negado: ${modo.motivo}` };

  try {
    const publicada = await publicarRegraDeFonte(e.supabase, e.par);

    const { promptInstrucoes } = await import("@/lib/nina/instrucoes-runtime.server");
    const turnoId = `verif-fonte-${e.par.id}-${Date.now()}`;
    const snapshot = await promptInstrucoes("homologacao", {}, "", turnoId);
    if (!snapshot.texto.trim() || snapshot.origem === "codigo") {
      return {
        ...base,
        versao: publicada.versao,
        versaoId: publicada.versaoId,
        origemVersao: snapshot.origem,
        fallbackPorErro: snapshot.fallbackPorErro,
        erro: snapshot.motivo ?? "versão publicada não pôde ser resolvida",
      };
    }

    // Contrato de precedência: a exceção publicada vence a regra geral de
    // apresentação NESTE turno — e apenas nele.
    const precedencia = resolverPrecedencia({
      regrasGerais: [REGRA_GERAL_SAUDACAO],
      excecoes: excecoesDaVerificacaoDeFonte(snapshot.texto),
    });

    const request = comporRequestNina({
      behaviorPrompt: textoContratoPrecedencia(precedencia),
      runtimeContext: {
        verificacao: {
          tipo: "fonte_e_aderencia",
          escopo_instrucoes: "homologacao",
          versao: snapshot.versao,
          ambiente: "homologacao",
          canal: CANAL_HOMOLOGACAO,
        },
        precedencia: resumoPrecedencia(precedencia),
      },
    });

    const { ninaAIGateway } = await import("@/lib/nina/ai-gateway.server");
    const resposta = await ninaAIGateway({
      clinicaId: e.clinicaId,
      perfil: "whatsapp",
      // Nenhuma ferramenta declarada: verificação sem ação real.
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: e.par.gatilho },
      ],
      maxTokens: 200,
    });

    const aderencia = avaliarAderenciaFonte({
      par: e.par,
      payload: request.systemPrompt,
      primeiraResposta: resposta.conteudo ?? "",
    });

    return {
      ...base,
      versao: snapshot.versao,
      versaoId: snapshot.versaoId,
      origemVersao: snapshot.origem,
      fallbackPorErro: snapshot.fallbackPorErro,
      hashPayload: await hashTexto(request.systemPrompt),
      modelo: resposta.modelo ?? null,
      regraChegouAoPayload: aderencia.regraChegouAoPayload,
      primeiraRespostaCumpriu: resposta.ok ? aderencia.primeiraRespostaCumpriu : false,
      erro: resposta.ok ? null : (resposta.erro ?? "falha na chamada ao modelo"),
    };
  } catch (err) {
    return { ...base, erro: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sessão NOVA sem a regra: prova que retirar a regra retira sua presença do
 * payload. Publica um texto de verificação sem o marcador e recompõe.
 */
export async function verificarRetiradaDaRegra(
  e: EntradaVerificacaoFonte,
): Promise<{ marcadorNoPayload: boolean; versao: number | null; erro: string | null }> {
  try {
    const conteudoSemRegra =
      "Você é a Nina em verificação técnica de homologação. Nenhuma regra de marcador está vigente nesta sessão.";
    const { data, error } = await e.supabase.rpc("nina_instrucoes_publicar", {
      p_escopo: "homologacao",
      p_conteudo: conteudoSemRegra,
      p_comentario: "verificação de fonte: retirada da regra",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const { invalidarCacheInstrucoes, promptInstrucoes } = await import(
      "@/lib/nina/instrucoes-runtime.server"
    );
    invalidarCacheInstrucoes("homologacao");
    const snapshot = await promptInstrucoes(
      "homologacao",
      {},
      "",
      `verif-retirada-${Date.now()}`,
    );
    const precedencia = resolverPrecedencia({
      regrasGerais: [REGRA_GERAL_SAUDACAO],
      excecoes: excecoesDaVerificacaoDeFonte(snapshot.texto),
    });
    const request = comporRequestNina({
      behaviorPrompt: textoContratoPrecedencia(precedencia),
      runtimeContext: { verificacao: { tipo: "retirada_da_regra" } },
    });
    return {
      marcadorNoPayload: request.systemPrompt.includes(e.par.marcador),
      versao: (row?.versao ?? null) as number | null,
      erro: null,
    };
  } catch (err) {
    return {
      marcadorNoPayload: false,
      versao: null,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verificação de ATENDIMENTO COMPLETO: usa o pipeline normal da homologação e
 * lê o registro do turno para separar modelo × pós-confiança.
 */
export async function verificarAtendimentoCompleto(entrada: {
  clinicaId: string;
  leadId: string;
  texto: string;
  userId: string | null;
}): Promise<{
  reply: string | null;
  processamento: string;
  transferida: boolean;
  turno: ResultadoAtendimentoCompleto;
}> {
  const { processarMensagemTeste } = await import("@/lib/nina/teste-console.server");
  const r = await processarMensagemTeste(
    {
      clinicaId: entrada.clinicaId,
      leadId: entrada.leadId,
      tipo: "text",
      texto: entrada.texto,
      chave: `verif-completo-${Date.now()}`,
    },
    entrada.userId,
  );

  let resumo: Record<string, unknown> | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { NODE_RESUMO_TURNO } = await import("@/lib/nina/rastreio/turno");
    const { data } = await (supabaseAdmin as any)
      .from("nina_trace_eventos")
      .select("metadata, started_at")
      .eq("clinica_id", entrada.clinicaId)
      .eq("node_id", NODE_RESUMO_TURNO)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resumo = (data?.metadata ?? null) as Record<string, unknown> | null;
  } catch {
    resumo = null;
  }

  return {
    reply: r.reply ?? null,
    processamento: r.processamento,
    transferida: r.transferida === true,
    turno: resumirAtendimentoCompleto(resumo),
  };
}
