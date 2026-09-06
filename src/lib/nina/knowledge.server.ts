/**
 * KNOWLEDGE RETRIEVAL DA NINA (camada única de consulta).
 *
 * Fluxo oficial:
 *   Paciente → intenção → searchKnowledgeBase() → CATÁLOGO ESTRUTURADO
 *   (registros PUBLICADOS) → resultado estruturado → modelo → resposta.
 *
 * FASE 7: o modo planilha deixou de existir. Não há segunda fonte, seleção de
 * fonte nem fallback: o que não está publicado no catálogo é tratado como
 * informação desconhecida.
 *
 * Server-only: usa o cliente administrativo e nunca entra no bundle do navegador.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ResultadoConhecimento } from "./knowledge-contract";

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

/** Termos usados só para auditoria da consulta (rastreabilidade). */
function termosAuditoria(texto: string): string[] {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 30);
}

/**
 * Log de auditoria da consulta. É registro histórico: não é fonte de conteúdo
 * e nunca é lido para responder ao paciente.
 */
async function registrarConsulta(entrada: {
  clinicaId: string;
  canal: string;
  pergunta: string;
  encontrados: Array<{ id: string; procedimento?: string | null; medico?: string | null }>;
  resposta: string;
}) {
  try {
    await supabaseAdmin.from("nina_kb_consultas").insert({
      clinica_id: entrada.clinicaId,
      base_id: null,
      versao: null,
      canal: entrada.canal,
      pergunta: entrada.pergunta.slice(0, 2000),
      termos: termosAuditoria(entrada.pergunta),
      encontrados: entrada.encontrados.slice(0, 10).map((e) => ({
        id: e.id,
        procedimento: e.procedimento ?? null,
        medico: e.medico ?? null,
        origem: "catalogo",
      })),
      registro_usado: entrada.encontrados[0]?.id ?? null,
      score: null,
      resposta: entrada.resposta.slice(0, 4000),
    });
  } catch (e) {
    console.error("[Nina catálogo] log de consulta falhou", (e as Error).message);
  }
}

/**
 * Ponto ÚNICO de consulta à Base de Conhecimentos da Nina (catálogo).
 * Toda ferramenta da Nina chama esta função.
 */
export async function searchKnowledgeBase(
  pedido: PedidoConhecimento,
): Promise<ResultadoConhecimento> {
  const query = String(pedido.query ?? "").trim().slice(0, 200);

  const { buscarNoCatalogo } = await import("./catalogo-retrieval.server");
  const resultado = await buscarNoCatalogo({
    clinicaId: pedido.clinicaId,
    query,
    medico: pedido.medico ?? null,
    ...(pedido.limite ? { limite: pedido.limite } : {}),
  });

  void registrarConsulta({
    clinicaId: pedido.clinicaId,
    canal: pedido.canal ?? "interno",
    pergunta: query,
    encontrados: resultado.records.map((r) => ({
      id: r.id,
      procedimento: r.procedimento,
      medico: r.medico,
    })),
    resposta: `fonte=catalogo knowledge_status=${resultado.knowledge_status}`,
  });

  console.info("[nina-catalogo]", {
    knowledge_status: resultado.knowledge_status,
    itens: resultado.records.length,
    trace: resultado.trace.slice(0, 3),
  });

  return resultado;
}
