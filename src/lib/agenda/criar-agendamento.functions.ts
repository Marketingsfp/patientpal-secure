// Ponto de entrada AUTENTICADO (funcionário logado) da criação/edição de
// agendamento.
//
// Toda a regra vive em `criar-agendamento.core.server.ts` — este arquivo só
// adiciona a autenticação do funcionário e repassa o cliente Supabase que já
// vem com o token dele (a RLS continua fazendo o escopo, exatamente como
// antes). Nenhuma regra, mensagem ou ordem de checagem mudou.
//
// A API de integração externa chama o MESMO núcleo, com ator próprio; assim
// não existe um segundo caminho de gravação com regras diferentes.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CriarAgendamentoInput, CriarAgendamentoResult } from "./criar-agendamento.types";

export type {
  CriarAgendamentoInput,
  CriarAgendamentoResult,
  PgErrorLike,
} from "./criar-agendamento.types";

export const criarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CriarAgendamentoInput) => data)
  .handler(async ({ data, context }): Promise<CriarAgendamentoResult> => {
    const { criarAgendamentoCore } = await import("./criar-agendamento.core.server");
    return criarAgendamentoCore(
      {
        db: context.supabase,
        ator: { tipo: "usuario", userId: context.userId },
      },
      data,
    );
  });
