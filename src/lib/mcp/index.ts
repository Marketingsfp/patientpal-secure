import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listarClinicas from "./tools/listar-clinicas";
import buscarPacientes from "./tools/buscar-pacientes";
import listarAgendamentos from "./tools/listar-agendamentos";
import listarMedicos from "./tools/listar-medicos";

// O emissor OAuth precisa ser o host direto do Supabase — a URL de proxy usada
// após a publicação é recusada por incompatibilidade de issuer (RFC 8414).
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "health-hub-pro",
  title: "Health Hub Pro",
  version: "0.1.0",
  instructions:
    "Ferramentas de consulta do Health Hub Pro (gestão de clínicas). Use `listar_clinicas` para descobrir as clínicas do usuário, `listar_medicos` e `buscar_pacientes` para localizar cadastros e `listar_agendamentos` para consultar a agenda por período. Todas as ferramentas são somente leitura e respeitam as permissões do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listarClinicas, listarMedicos, buscarPacientes, listarAgendamentos],
});
