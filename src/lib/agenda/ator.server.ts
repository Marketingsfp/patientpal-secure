// Identidade de quem está executando uma operação de agenda.
//
// Existe porque a mesma regra de negócio pode ser disparada por dois caminhos
// muito diferentes:
//
//   1. Um funcionário logado (Agenda clássica, V2, Atendimento Múltiplo).
//      O cliente Supabase carrega o token do usuário e a RLS faz o escopo.
//
//   2. Uma integração externa autenticada por chave de API
//      (/api/integrations/v1). Nesse caminho o cliente usa service role e a
//      RLS NÃO protege nada — por isso o escopo de clínica passa a ser
//      verificado no código, obrigatoriamente, via `assertEscopoClinica`.
//
// Este arquivo é `.server.ts`: o bundler recusa qualquer import dele a partir
// de código de navegador.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DbAgenda = SupabaseClient<Database>;

export type AtorAgenda =
  | {
      tipo: "usuario";
      userId: string;
      email?: string | null;
      nome?: string | null;
    }
  | {
      tipo: "integracao";
      api_key_id: string;
      clinica_id: string;
      origem_integracao: string;
      /**
       * Chave com escopo `appointments:write:all` — pode alterar qualquer
       * agendamento da própria clínica, não só os que ela mesma criou.
       * Sem isso (padrão), a integração só mexe no que nasceu dela.
       */
      pode_gerenciar_todos?: boolean;
    };


/** Contexto passado para todo núcleo de regra de agenda. */
export type CtxAgenda = {
  db: DbAgenda;
  ator: AtorAgenda;
};

/** Erro de escopo — vira 404 na API de integração, nunca vaza detalhe. */
export class EscopoClinicaError extends Error {
  constructor(message = "Recurso não encontrado nesta clínica.") {
    super(message);
    this.name = "EscopoClinicaError";
  }
}

/**
 * Garante que a operação está acontecendo dentro da clínica da chave de API.
 *
 * Para ator do tipo "usuario" é no-op: quem faz o escopo é a RLS do Supabase,
 * que já roda com o token do funcionário.
 *
 * Para ator do tipo "integracao" é obrigatório: o service role ignora RLS, e
 * a única barreira é esta. Lança (em vez de retornar false) justamente para
 * não permitir que um caller ignore o resultado por esquecimento.
 */
export function assertEscopoClinica(ator: AtorAgenda, clinicaId: string | null | undefined): void {
  if (ator.tipo !== "integracao") return;
  if (!clinicaId || clinicaId !== ator.clinica_id) {
    throw new EscopoClinicaError();
  }
}

/**
 * Mesma checagem, aplicada a um registro que acabou de ser lido do banco.
 * Confere clínica E parceiro: uma integração nunca alcança o agendamento
 * criado por outra, mesmo dentro da mesma clínica — salvo quando a chave tem
 * o escopo `appointments:write:all`, concedido caso a caso.
 */
export function assertEscopoRegistro(
  ator: AtorAgenda,
  registro: { clinica_id?: string | null; origem_integracao?: string | null } | null | undefined,
): void {
  if (ator.tipo !== "integracao") return;
  if (!registro) throw new EscopoClinicaError();
  assertEscopoClinica(ator, registro.clinica_id);
  if (ator.pode_gerenciar_todos) return;
  if ((registro.origem_integracao ?? null) !== ator.origem_integracao) {
    throw new EscopoClinicaError();
  }
}

