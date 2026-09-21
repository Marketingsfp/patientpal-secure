/**
 * Ferramenta de handoff da Nina: `solicitar_atendente_humano`.
 *
 * Fica SEMPRE disponível para o modelo (independe da flag de agenda), porque
 * pedir uma pessoa é o mínimo que a IA precisa saber fazer. A execução é
 * server-side e escopada por clínica.
 */
import { encaminharParaHumano } from "@/lib/atendimento/handoff.server";
import { motivoProfissionalSfp } from "./regras-catalogo";

export const NOME_FERRAMENTA_HANDOFF = "solicitar_atendente_humano";

export const FERRAMENTA_HANDOFF = {
  type: "function",
  function: {
    name: NOME_FERRAMENTA_HANDOFF,
    description:
      "Transfere a conversa para atendimento humano. Use para pedido explícito por uma pessoa, reclamação, urgência clínica, cobrança, dependência da equipe, ausência confirmada no catálogo/agenda ou identificação ainda ambígua após as respostas a duas perguntas de esclarecimento. Se a primeira resposta não esclarecer a identificação, faça a segunda pergunta antes de encaminhar por esse motivo. Analise o pedido e consulte a fonte apropriada antes de concluir ausência; motivo e resumo devem explicar a pendência específica. Não repita uma transferência confirmada. O sistema coordena o aviso e o protocolo; não produza uma segunda mensagem após o encaminhamento. Profissional SFP exige motivo PROFISSIONAL_SFP e transferência silenciosa, sem nenhuma mensagem ao paciente.",
    parameters: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          description: "Motivo curto do encaminhamento (ex.: 'paciente pediu atendente').",
        },
        resumo: {
          type: "string",
          description:
            "Resumo objetivo do que já foi conversado e do que o paciente precisa, para o atendente não pedir tudo de novo.",
        },
        urgencia: { type: "string", enum: ["baixa", "normal", "alta"] },
        setor: {
          type: "string",
          description:
            "Nome do setor/fila desejado quando for evidente (ex.: 'Financeiro', 'Agendamento'). Opcional.",
        },
      },
      required: ["motivo", "resumo"],
      additionalProperties: false,
    },
  },
} as const;

export function ehFerramentaHandoff(nome: string | undefined | null) {
  return nome === NOME_FERRAMENTA_HANDOFF;
}

export async function executarHandoffTool(
  ctx: { clinicaId: string; conversaId: string | null },
  argumentosJson: string | undefined,
) {
  if (!ctx.conversaId) {
    return { ok: false, erro: "SEM_CONVERSA", mensagem: "Conversa não identificada." };
  }
  let args: Record<string, unknown> = {};
  try {
    args = argumentosJson ? JSON.parse(argumentosJson) : {};
  } catch {
    args = {};
  }
  const motivo = String(args.motivo ?? "Paciente solicitou atendimento humano").slice(0, 500);
  const resumo = args.resumo ? String(args.resumo).slice(0, 2000) : null;
  const urgencia = ["baixa", "normal", "alta"].includes(String(args.urgencia))
    ? (String(args.urgencia) as "baixa" | "normal" | "alta")
    : "normal";
  const setor = args.setor ? String(args.setor).slice(0, 120) : null;

  const r = await encaminharParaHumano({
    clinicaId: ctx.clinicaId,
    conversaId: ctx.conversaId,
    motivo,
    resumo,
    urgencia,
    departamentoNome: setor,
    solicitadoPor: "IA",
  });
  const silencioso = r.ok && motivoProfissionalSfp(motivo);

  return {
    ok: r.ok,
    sem_mensagem_paciente: silencioso,
    ja_com_humano: r.ja_estava_com_humano ?? false,
    aviso: r.aviso ?? null,
    posicao_fila: r.posicao_fila ?? null,
    setor: r.departamento ?? null,
    instrucao_para_voce: silencioso
      ? "Encerre o turno sem mensagem ao paciente. A transferência por profissional SFP é silenciosa."
      : r.ok
        ? "O sistema coordena o aviso e o protocolo. Encerre o turno sem produzir outro aviso ou continuar o atendimento; não repita a transferência."
        : "O encaminhamento não foi confirmado. Informe a dificuldade sem afirmar que transferiu, seguindo o tratamento de falha disponível.",
  };
}
