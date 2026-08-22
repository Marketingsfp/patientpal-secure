import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "listar_clinicas",
  title: "Listar clínicas",
  description:
    "Lista as clínicas às quais o usuário autenticado tem acesso, com id, nome, cidade e estado. Use o id retornado para filtrar as demais ferramentas.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("clinicas")
      .select("id, nome, cidade, estado, ativo")
      .order("nome");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { clinicas: data ?? [] },
    };
  },
});
