import { podeAbrirTelaOsZap } from "@/lib/atendimento/acesso-telas-oszap";
import { moduloTelaOsZap, TELAS_OSZAP } from "@/lib/permissoes-oszap";
import { moduloPermitido, podeAbrirPortalRh, ROUTE_TO_MODULE } from "@/lib/permissoes-rotas";
import type { SubsystemId } from "@/lib/subsystem";

/**
 * Portais que o usuário não vê no hub (/app) nem no seletor do cabeçalho.
 * Um portal some quando nenhuma tela dele está liberada na matriz de Perfis
 * de Acesso — assim ninguém clica num cartão para cair em "Acesso negado".
 * A Clínica Médica nunca some: é o portal de base de todos os perfis.
 *
 * Fica num lugar só porque o hub e o seletor tinham regras diferentes: o hub
 * mostrava o Coach para todo mundo, o seletor escondia.
 */
export function portaisOcultos(
  allowed: Set<string> | null,
  configured: Set<string> | null | undefined,
  perfil: string | null | undefined,
): SubsystemId[] {
  if (allowed === null) return []; // admin vê tudo
  const ocultos: SubsystemId[] = [];
  // Nina e Francisco têm permissões independentes dentro do OS ZAP.
  const temOsZap = TELAS_OSZAP.some((t) => {
    if (!podeAbrirTelaOsZap(perfil, t.to, t.hash)) return false;
    const mod = moduloTelaOsZap(t.to, t.hash) ?? ROUTE_TO_MODULE[t.to];
    return mod !== undefined && moduloPermitido(mod, allowed, configured);
  });
  if (!temOsZap) ocultos.push("os-zap");
  if (!podeAbrirPortalRh(allowed, configured)) ocultos.push("gestao-pessoas");
  if (!moduloPermitido(ROUTE_TO_MODULE["/app/coach"], allowed, configured)) ocultos.push("coach");
  return ocultos;
}
