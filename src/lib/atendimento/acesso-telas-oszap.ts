import { podeGerenciarDepartamentos } from "./departamentos";
import { DEPARTAMENTOS_HABILITADOS } from "./departamentos-flag";

/** Telefonia usa o atendimento; não vê configuração, treinamento ou gestão da Nina. */
const ABAS_RESTRITAS = new Set([
  "dashboard-oszap", // Visão consolidada de gestão da equipe, com o mesmo acesso da TV.
  "informacoes-clinica",
  "base-conhecimento", // Catálogo editorial independente do atendimento.
  "homologacao",
  "laboratorio-nina",
  "config",
  "templates",
]);
const ROTAS_RESTRITAS = [
  "/app/francisco",
  "/app/nina-aprendizado",
  "/app/nina-metricas",
  "/app/nina-arquitetura",
  "/app/nina-jev",
];

/** Restrição adicional, usada pelo menu e pela guarda de links diretos. */
export function podeAbrirTelaOsZap(
  perfil: string | null | undefined,
  pathname: string,
  hash = "",
  departamentosHabilitados = DEPARTAMENTOS_HABILITADOS,
): boolean {
  const rota = pathname.replace(/\/+$/, "");
  if (rota === "/app/nina" && hash.replace(/^#/, "") === "atend-departamentos")
    return departamentosHabilitados && podeGerenciarDepartamentos(perfil);
  if (perfil !== "telefonia") return true;
  if (ROTAS_RESTRITAS.some((r) => rota === r || rota.startsWith(`${r}/`))) return false;
  return rota !== "/app/nina" || !ABAS_RESTRITAS.has(hash.replace(/^#/, ""));
}
