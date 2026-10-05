import { z } from "zod";

export const TEMPERATURA_PADRAO = 1;
export const FLAG_TEMPERATURA_NINA = "nina_temperatura_whatsapp";
export const temperaturaSchema = z.number().finite().min(0).max(2);
export type ConfigTemperatura = {
  temperatura: number;
  revisao: string | null;
  origem: "configurada" | "padrao" | "padrao_configuracao_invalida" | "padrao_falha_leitura";
};

export function selecaoTemperatura(linha: { ativo?: boolean; config?: unknown; updated_at?: string } | null): ConfigTemperatura {
  const revisao = linha?.updated_at ?? null;
  if (!linha || linha.ativo === false) return { temperatura: TEMPERATURA_PADRAO, revisao, origem: "padrao" };
  const valor = temperaturaSchema.safeParse((linha.config as { temperatura?: unknown } | null)?.temperatura);
  return valor.success
    ? { temperatura: valor.data, revisao, origem: "configurada" }
    : { temperatura: TEMPERATURA_PADRAO, revisao, origem: "padrao_configuracao_invalida" };
}
