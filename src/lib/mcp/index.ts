import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listarPacientesTool from "./tools/listar-pacientes";

// A URL do issuer precisa ser o host direto do Supabase (não o proxy .lovable.cloud).
// Vite inlineia VITE_SUPABASE_PROJECT_ID em build; o fallback só existe para o
// eval de extração de manifesto e nunca valida tokens reais.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "clinicaos-mcp",
  title: "ClinicaOS",
  version: "0.1.0",
  instructions:
    "Servidor MCP do ClinicaOS. Ferramentas executam como o usuário autenticado e respeitam permissões e RLS por clínica. Use `whoami` para verificar a conexão e `listar_pacientes` para buscar pacientes acessíveis ao usuário.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listarPacientesTool],
});