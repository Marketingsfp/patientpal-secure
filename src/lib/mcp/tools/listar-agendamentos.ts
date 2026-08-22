import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_agendamentos",
  title: "Listar agendamentos",
  description:
    "Lista os agendamentos de um período (data inicial e final, formato AAAA-MM-DD) nas clínicas do usuário autenticado. Permite filtrar por clínica, médico e status.",
  inputSchema: {
    data_inicio: z.string().describe("Data inicial no formato AAAA-MM-DD."),
    data_fim: z.string().optional().describe("Data final AAAA-MM-DD (padrão: igual à inicial)."),
    clinica_id: z.string().uuid().optional().describe("Filtra por uma clínica específica."),
    medico_id: z.string().uuid().optional().describe("Filtra por um médico específico."),
    status: z.string().optional().describe("Filtra por status do agendamento."),
    limite: z.number().int().optional().describe("Máximo de resultados (padrão 100, teto 300)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ data_inicio, data_fim, clinica_id, medico_id, status, limite }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const dataRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRe.test(data_inicio) || (data_fim && !dataRe.test(data_fim))) {
      return {
        content: [{ type: "text", text: "Datas devem estar no formato AAAA-MM-DD." }],
        isError: true,
      };
    }
    const fim = data_fim ?? data_inicio;
    const max = Math.min(Math.max(limite ?? 100, 1), 300);
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("agendamentos")
      .select(
        "id, inicio, fim, paciente_nome, paciente_id, medico_id, procedimento, tipo_atendimento, status, fluxo_etapa, clinica_id",
      )
      .gte("inicio", `${data_inicio}T00:00:00`)
      .lte("inicio", `${fim}T23:59:59`)
      .order("inicio")
      .limit(max);
    if (clinica_id) query = query.eq("clinica_id", clinica_id);
    if (medico_id) query = query.eq("medico_id", medico_id);
    if (status) query = query.eq("status", status as never);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { total: data?.length ?? 0, agendamentos: data ?? [] },
    };
  },
});
