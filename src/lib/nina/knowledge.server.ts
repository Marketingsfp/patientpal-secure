/**
 * CONSULTA DA NINA AO CADASTRO (camada única de consulta).
 *
 * Fluxo oficial:
 *   Paciente → intenção → searchKnowledgeBase() → FONTE SELECIONADA NA CLÍNICA
 *   (médicos, horários, consultas, exames e procedimentos) → resultado
 *   estruturado → modelo → resposta.
 *
 * A seleção manual escolhe entre cadastro do sistema e base editorial publicada.
 * Não mistura fontes nem faz fallback. A equipe corrige os dados na fonte escolhida.
 *
 * Server-only.
 */
import type { ResultadoConhecimento } from "./knowledge-contract";
import type { TipoAtendimentoCatalogo } from "./catalogo-pesquisa";

export type { ResultadoConhecimento };

export type PedidoConhecimento = {
  clinicaId: string;
  /** Pergunta/intenção do paciente já resumida em termos de busca. */
  query: string;
  tipo_atendimento?: TipoAtendimentoCatalogo;
  medico?: string | null;
  dia?: string | null;
  limite?: number;
  /** Canal de origem da consulta: "whatsapp", "interno", "voz"... */
  canal?: string;
};

/**
 * Ponto ÚNICO de consulta ao cadastro. Toda ferramenta da Nina chama esta função.
 */
export async function searchKnowledgeBase(
  pedido: PedidoConhecimento,
): Promise<ResultadoConhecimento> {
  const query = String(pedido.query ?? "").trim().slice(0, 200);

  const { buscarNoCatalogo } = await import("./catalogo-retrieval.server");
  const resultado = await buscarNoCatalogo({
    clinicaId: pedido.clinicaId,
    query,
    tipo_atendimento: pedido.tipo_atendimento,
    medico: pedido.medico ?? null,
    // Dia pedido pelo paciente: até aqui ele era aceito e descartado.
    dia: pedido.dia ?? null,
    ...(pedido.limite ? { limite: pedido.limite } : {}),
  });

  console.info("[nina-cadastro]", {
    fonte_consulta: resultado.fonte_consulta,
    knowledge_status: resultado.knowledge_status,
    itens: resultado.records.length,
    trace: resultado.trace.slice(0, 3),
  });

  return resultado;
}
