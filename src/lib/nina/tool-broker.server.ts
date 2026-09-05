/**
 * FASE 4 — TOOL BROKER (execução server-side).
 *
 * Ponto ÚNICO de execução de ferramentas da Nina. Reutiliza as tools que já
 * existem (`executarFerramentaPaciente` e a tool de handoff) e acrescenta:
 *
 * - divisão de fontes (planilha / agenda / CRM / atendimento);
 * - idempotência de turno: retry com os mesmos argumentos não executa de novo;
 * - validação: `success=false` nunca vira "confirmado" para o modelo;
 * - trilha interna dos resultados para o Context Builder.
 */
import {
  chaveIdempotencia,
  descreverFerramenta,
  respostaParaModelo,
  validarResultado,
  type ResultadoBroker,
} from "./tool-broker";
import type { CtxNinaPaciente } from "./paciente-tools.server";

export type ToolBroker = {
  executar: (nome: string, args: unknown) => Promise<ResultadoBroker>;
  /** Resultados do turno, na ordem, para alimentar o contexto. */
  resultados: () => Array<{ ferramenta: string; resultado: unknown }>;
  /** Houve agendamento gravado e verificado neste turno. */
  agendamentoConfirmado: () => boolean;
  /** A conversa foi encaminhada para atendimento humano. */
  handoffSolicitado: () => boolean;
};

export function criarToolBroker(params: {
  ctxPaciente: CtxNinaPaciente | null;
  ctxHandoff: { clinicaId: string; conversaId: string | null };
  executarPaciente:
    | ((ctx: CtxNinaPaciente, nome: string, args: unknown) => Promise<unknown>)
    | null;
}): ToolBroker {
  const cache = new Map<string, ResultadoBroker>();
  const trilha: Array<{ ferramenta: string; resultado: unknown }> = [];
  let confirmou = false;
  let handoff = false;

  async function executar(nome: string, args: unknown): Promise<ResultadoBroker> {
    const chave = chaveIdempotencia(nome, args);
    const emCache = cache.get(chave);
    // Retry do modelo com os MESMOS argumentos não repete a operação.
    if (emCache) return { ...emCache, reused: true };

    const descritor = descreverFerramenta(nome);
    let bruto: unknown;
    try {
      if (descritor?.capacidade === "requestHumanHandoff") {
        const { executarHandoffTool } = await import("./handoff-tool.server");
        bruto = await executarHandoffTool(
          params.ctxHandoff,
          typeof args === "string" ? args : JSON.stringify(args ?? {}),
        );
        handoff = true;
      } else if (params.executarPaciente && params.ctxPaciente) {
        bruto = await params.executarPaciente(params.ctxPaciente, nome, args);
      } else {
        bruto = { ok: false, erro: "FERRAMENTA_INDISPONIVEL" };
      }
    } catch (e) {
      console.error("[NINA_TOOL_BROKER] falha", nome, e);
      bruto = { ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha ao consultar o sistema." };
    }

    const validado = validarResultado(nome, bruto);
    if (validado.appointment_confirmed) confirmou = true;
    cache.set(chave, validado);
    const paraModelo = respostaParaModelo(validado);
    trilha.push({ ferramenta: nome, resultado: paraModelo });
    console.info("[NINA_TOOL_BROKER]", {
      ferramenta: nome,
      capacidade: validado.capacidade,
      fonte: validado.fonte,
      success: validado.success,
      erro: validado.erro ?? null,
    });
    return validado;
  }

  return {
    executar,
    resultados: () => [...trilha],
    agendamentoConfirmado: () => confirmou,
    handoffSolicitado: () => handoff,
  };
}

export { respostaParaModelo };
