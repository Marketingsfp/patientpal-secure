import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { LeituraPedidoBalcao } from "./leitura-pedido";
import { DATA_URL_PEDIDO, lerPedidoMedicoNaIA } from "./ler-pedido-medico.server";

const Entrada = z.object({
  // Data URL da foto já reduzida no navegador (ou PDF escaneado).
  arquivo: z.string().min(50).max(12_000_000).regex(DATA_URL_PEDIDO),
});

/** Foto escolhida no próprio computador da recepção. */
export const lerPedidoMedicoParaOrcamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Entrada.parse(i))
  .handler(async ({ data }): Promise<LeituraPedidoBalcao> => lerPedidoMedicoNaIA(data.arquivo));
