/**
 * Funções de servidor da ligação de demonstração (aba "Ligação" do OS ZAP).
 *
 * Toda chamada confere: login, vínculo ativo com a clínica, permissão da tela
 * `nina-ligacao` na matriz do OS ZAP e a flag `nina_ligacao_demo` da clínica.
 * Ver as instruções exige leitura; ligar e executar ferramentas, escrita.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { MODULO_LIGACAO } from "./config";

async function autorizar(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  escrita: boolean,
) {
  const [{ carregarAcessosOsZap }, { flagLigacaoAtiva }] = await Promise.all([
    import("@/lib/permissoes-oszap.server"),
    import("./flag.server"),
  ]);
  const acessos = await carregarAcessosOsZap(supabase, userId, clinicaId);
  const acesso = acessos[MODULO_LIGACAO];
  if (acesso !== "write" && (escrita || acesso !== "read"))
    throw new Error("Sem permissão para a ligação de demonstração.");
  if (!(await flagLigacaoAtiva(clinicaId)))
    throw new Error("A ligação de demonstração não está ativa nesta clínica.");
}

const entrada = z.object({ clinicaId: z.string().uuid() });

export const resumoLigacaoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => entrada.parse(v))
  .handler(async ({ data, context }) => {
    await autorizar(context.supabase, context.userId, data.clinicaId, false);
    const { montarSessaoLigacao } = await import("./contrato-ligacao.server");
    return (await montarSessaoLigacao(data.clinicaId)).resumo;
  });

// Abrir a ligação agora é feito pela conexão contínua `/api/nina-ligacao` (sessao-live.server.ts).

export const executarFerramentaLigacaoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    entrada
      .extend({
        nome: z.string().regex(/^[a-z_]{1,64}$/),
        argumentos: z.string().max(20_000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await autorizar(context.supabase, context.userId, data.clinicaId, true);
    const { executarFerramentaLigacao } = await import("./ferramentas-ligacao.server");
    return executarFerramentaLigacao(data.clinicaId, data.nome, data.argumentos);
  });
