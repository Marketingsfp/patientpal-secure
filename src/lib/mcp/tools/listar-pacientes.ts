import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "listar_pacientes",
  title: "Listar pacientes",
  description:
    "Lista pacientes acessíveis ao usuário autenticado, respeitando RLS por clínica. Retorna id, nome e telefone.",
  inputSchema: {
    busca: z.string().trim().optional().describe("Filtro parcial por nome do paciente."),
    limite: z.number().int().min(1).max(50).optional().describe("Quantidade máxima de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ busca, limite }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("pacientes")
      .select("id, nome, telefone")
      .order("nome", { ascending: true })
      .limit(limite ?? 20);
    if (busca) query = query.ilike("nome", `%${busca}%`);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { pacientes: data ?? [] },
    };
  },
});