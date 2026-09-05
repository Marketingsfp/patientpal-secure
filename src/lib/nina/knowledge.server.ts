/**
 * FASE 3 — KNOWLEDGE RETRIEVAL DA NINA (camada única de consulta).
 *
 * Fluxo oficial:
 *   Paciente → intenção → searchKnowledgeBase() → planilha (base ATIVA)
 *   → resultado estruturado → modelo → resposta.
 *
 * Só o conteúdo RELEVANTE vai ao modelo (busca estruturada + semântica com
 * limite), nunca a planilha inteira a cada mensagem.
 *
 * Server-only: usa o cliente administrativo e nunca entra no bundle do navegador.
 */
import {
  montarResultadoConhecimento,
  type ResultadoConhecimento,
} from "./knowledge-contract";

export type { ResultadoConhecimento };

export type PedidoConhecimento = {
  clinicaId: string;
  /** Pergunta/intenção do paciente já resumida em termos de busca. */
  query: string;
  medico?: string | null;
  dia?: string | null;
  limite?: number;
  /** Canal apenas para auditoria: "whatsapp", "interno", "voz"... */
  canal?: string;
};

/**
 * Ponto ÚNICO de consulta à Base de Conhecimentos. Toda ferramenta da Nina
 * chama esta função — nada de consultar a planilha por caminhos paralelos.
 */
export async function searchKnowledgeBase(
  pedido: PedidoConhecimento,
): Promise<ResultadoConhecimento> {
  const { consultarBase, registrarConsultaKb } = await import("./kb.server");
  const { expandirTermos } = await import("./kb-parser");

  const query = String(pedido.query ?? "").trim().slice(0, 200);
  const achado = await consultarBase({
    clinicaId: pedido.clinicaId,
    termo: query,
    medico: pedido.medico ?? null,
    dia: pedido.dia ?? null,
    ...(pedido.limite ? { limite: pedido.limite } : {}),
  });

  const resultado = montarResultadoConhecimento({
    registros: achado.registros as never,
    base: achado.base
      ? { versao: achado.base.versao, arquivo: achado.base.arquivo }
      : null,
    ambiguo: achado.ambiguo,
  });

  // Rastreabilidade: item, aba, linha, registro e versão ficam registrados.
  void registrarConsultaKb({
    clinicaId: pedido.clinicaId,
    baseId: achado.base?.id ?? null,
    versao: achado.base?.versao ?? null,
    canal: pedido.canal ?? "interno",
    pergunta: query,
    termos: expandirTermos(query),
    encontrados: achado.registros,
    resposta: `knowledge_status=${resultado.knowledge_status}`,
  });

  console.info("[nina-kb]", {
    knowledge_status: resultado.knowledge_status,
    versao: resultado.base_version,
    itens: resultado.records.length,
    trace: resultado.trace.slice(0, 3),
  });

  return {
    ...resultado,
    // Consolidação por profissional continua disponível para o modelo.
    ...(achado.consolidado?.length
      ? ({ consolidado_por_profissional: achado.consolidado } as never)
      : {}),
  };
}
