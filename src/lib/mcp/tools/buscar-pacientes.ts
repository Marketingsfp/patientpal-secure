import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "buscar_pacientes",
  title: "Buscar pacientes",
  description:
    "Busca pacientes por nome ou CPF dentro das clínicas do usuário autenticado. Retorna dados básicos de contato, sem dados clínicos.",
  inputSchema: {
    termo: z.string().trim().min(2).describe("Parte do nome ou CPF do paciente."),
    clinica_id: z.string().uuid().optional().describe("Filtra por uma clínica específica."),
    limite: z.number().int().optional().describe("Máximo de resultados (padrão 20, teto 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ termo, clinica_id, limite }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const max = Math.min(Math.max(limite ?? 20, 1), 50);
    const digitos = termo.replace(/\D/g, "");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("pacientes")
      .select("id, nome, cpf, telefone, data_nascimento, clinica_id, ativo")
      .limit(max)
      .order("nome");
    if (clinica_id) query = query.eq("clinica_id", clinica_id);
    query =
      digitos.length >= 3
        ? query.or(`nome.ilike.%${termo}%,cpf_digits.ilike.%${digitos}%`)
        : query.ilike("nome", `%${termo}%`);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { pacientes: data ?? [] },
    };
  },
});
