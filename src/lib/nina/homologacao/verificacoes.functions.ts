/**
 * FASE 4 — server functions das duas verificações da homologação.
 *
 * Ambas exigem sessão autenticada e vínculo com a clínica. A verificação de
 * fonte publica no escopo isolado pelo client AUTENTICADO, então a RPC segue
 * exigindo administrador — nenhuma flag global é alterada.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { PARES_MARCADOR_PADRAO, type ParMarcador } from "@/lib/nina/homologacao/verificacoes";

async function assertMembership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

const parSchema = z.object({
  id: z.string().min(1),
  gatilho: z.string().min(1),
  marcador: z.string().min(3),
});

/** A. Validar fonte e aderência do prompt. */
export const validarFonteEAderencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        pares: z.array(parSchema).min(1).max(4).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const pares: ParMarcador[] = (data.pares ?? [...PARES_MARCADOR_PADRAO]) as ParMarcador[];
    const { verificarFonteEAderencia, verificarRetiradaDaRegra } = await import(
      "@/lib/nina/homologacao/verificacoes.server"
    );

    const resultados = [];
    for (const par of pares) {
      resultados.push(
        await verificarFonteEAderencia({
          clinicaId: data.clinicaId,
          par,
          supabase: context.supabase,
        }),
      );
    }

    // Sessão nova sem a regra: o marcador precisa sumir do payload.
    const retirada = await verificarRetiradaDaRegra({
      clinicaId: data.clinicaId,
      par: pares[0]!,
      supabase: context.supabase,
    });

    return {
      tipo: "fonte_e_aderencia" as const,
      exercitado:
        "Publicação real no escopo isolado de homologação, resolução pela versão publicada e uma chamada real ao modelo por par. Sem ferramentas, sem políticas de confiança, sem envio.",
      resultados,
      retiradaDaRegra: retirada,
    };
  });

/** B. Validar atendimento completo (pipeline normal). */
export const validarAtendimentoCompleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        texto: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { verificarAtendimentoCompleto } = await import(
      "@/lib/nina/homologacao/verificacoes.server"
    );
    const r = await verificarAtendimentoCompleto({
      clinicaId: data.clinicaId,
      leadId: data.leadId,
      texto: data.texto,
      userId: context.userId,
    });
    return {
      tipo: "atendimento_completo" as const,
      exercitado:
        "Pipeline completo da homologação: agrupamento, trava por conversa, modelo, ferramentas, políticas de confiança e finalização. Nenhuma mensagem é enviada ao WhatsApp.",
      ...r,
    };
  });
