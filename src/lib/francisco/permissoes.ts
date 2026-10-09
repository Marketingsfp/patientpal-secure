import type { Acesso } from "@/lib/permissoes-presets";
import { ABAS_FRANCISCO, type AbaFrancisco, type FranciscoConfig } from "./config";

export type AcessosFrancisco = Record<AbaFrancisco, Acesso>;
export function acessosFrancisco(telas: Record<string, Acesso>): AcessosFrancisco {
  return Object.fromEntries(
    ABAS_FRANCISCO.map(([aba]) => [aba, telas[`francisco-${aba}`] ?? "none"]),
  ) as AcessosFrancisco;
}

/** Cada campo só pode ser salvo pela tela que contém seu editor. */
const TELA_DO_CAMPO: Record<keyof FranciscoConfig, AbaFrancisco> = {
  ativo: "arquitetura",
  modo: "arquitetura",
  nome: "arquitetura",
  modelo: "arquitetura",
  temperatura: "arquitetura",
  systemPrompt: "arquitetura",
  inicio: "arquitetura",
  fim: "arquitetura",
  dias: "arquitetura",
  limiteRodada: "arquitetura",
  d1: "arquitetura",
  d4: "arquitetura",
  departamento: "arquitetura",
  voz: "voz",
  templates: "mensagens",
};
export function conferirEdicaoFrancisco(
  acessos: AcessosFrancisco,
  anterior: FranciscoConfig,
  proximo: FranciscoConfig,
): void {
  for (const chave of Object.keys(TELA_DO_CAMPO) as (keyof FranciscoConfig)[]) {
    if (JSON.stringify(anterior[chave]) === JSON.stringify(proximo[chave])) continue;
    if (acessos[TELA_DO_CAMPO[chave]] !== "write")
      throw new Error("Sem permissão para alterar esta parte da configuração do Francisco.");
  }
}
