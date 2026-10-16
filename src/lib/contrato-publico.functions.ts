import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { montarCorpoContrato, montarDocumentoContrato } from "@/lib/print-contrato";

/**
 * Texto do contrato para a página pública de assinatura (/p/contrato/$token),
 * com os campos {{PACIENTE_*}} já preenchidos — o mesmo documento que sai na
 * impressão interna. Quem abre o link não tem login, então o acesso é só pelo
 * token público do contrato (o mesmo critério do RPC contrato_publico).
 */
export const documentoContratoPublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(16).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { data: contrato } = await supabaseAdmin
      .from("contratos_assinatura")
      .select("id")
      .eq("token_publico", data.token)
      .maybeSingle();
    if (!contrato) return { html: null };

    try {
      const { corpo, titulo } = await montarCorpoContrato(supabaseAdmin, contrato.id);
      return { html: montarDocumentoContrato(corpo, titulo) };
    } catch {
      return { html: null };
    }
  });
