import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_medicos",
  title: "Listar médicos",
  description:
    "Lista os médicos cadastrados nas clínicas do usuário autenticado, com CRM e duração padrão de consulta. Não retorna dados bancários.",
  inputSchema: {
    clinica_id: z.string().uuid().optional().describe("Filtra por uma clínica específica."),
    apenas_ativos: z.boolean().optional().describe("Se verdadeiro, retorna só médicos ativos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ clinica_id, apenas_ativos }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("medicos")
      .select("id, nome, crm, crm_uf, ativo, duracao_consulta_min, clinica_id")
      .order("nome");
    if (clinica_id) query = query.eq("clinica_id", clinica_id);
    if (apenas_ativos) query = query.eq("ativo", true);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { medicos: data ?? [] },
    };
  },
});
