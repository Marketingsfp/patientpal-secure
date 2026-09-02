// Descobre o NOME DE QUEM FATUROU um atendimento — a linha "Atendente" da GR.
//
// Por que isto precisa rodar no servidor:
// a guia é montada no navegador, onde toda consulta passa pelo RLS. Duas
// situações deixavam a resposta vazia mesmo existindo um faturamento:
//
//   1. o lançamento foi gravado em OUTRA clínica (paciente atendido aqui e
//      faturado lá) — `fin_lanc_select` esconde a linha de quem não é membro
//      daquela clínica;
//   2. o perfil de quem faturou não é legível pela política
//      `profiles_peer_select` (ou o cadastro está sem o campo `nome`).
//
// Nos dois casos a GR caía no último fallback e imprimia o nome de quem estava
// IMPRIMINDO, não o de quem faturou. A consulta agora usa a sessão autenticada
// recebida pelo middleware e respeita o RLS. Isso evita que uma configuração
// administrativa ausente derrube a impressão inteira.
//
// Acesso: só responde a quem é membro da clínica informada, e só olha
// agendamentos que realmente pertencem a ela.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  clinicaId: z.string().uuid(),
  agendamentoIds: z.array(z.string().uuid()).min(1).max(50),
});

export type NomeQuemFaturouResult = { nome: string | null };

export const nomeDeQuemFaturou = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }): Promise<NomeQuemFaturouResult> => {
    const { supabase, userId } = context;

    const { data: membro, error: errMembro } = await supabase
      .from("clinica_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("clinica_id", data.clinicaId)
      .eq("ativo", true)
      .maybeSingle();
    if (errMembro) throw new Error(errMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    // O id do agendamento vem do cliente: confere que é mesmo desta clínica
    // antes de olhar o financeiro dele.
    const { data: ags, error: errAgs } = await supabase
      .from("agendamentos")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .in("id", data.agendamentoIds);
    if (errAgs) throw new Error(errAgs.message);
    const ids = ((ags ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return { nome: null };

    const { data: lancs, error: errLancs } = await supabase
      .from("fin_lancamentos")
      .select("criado_por, tipo, created_at")
      .in("agendamento_id", ids)
      .neq("status", "cancelado")
      .order("created_at", { ascending: true });
    if (errLancs) throw new Error(errLancs.message);
    const linhas = (lancs ?? []) as Array<{ criado_por: string | null; tipo: string | null }>;
    // Preferência pela receita (o faturamento em si); qualquer outro
    // lançamento do atendimento serve como segunda opção.
    const autor =
      linhas
        .filter((l) => l.tipo === "receita")
        .map((l) => l.criado_por)
        .find((v): v is string => !!v) ??
      linhas.map((l) => l.criado_por).find((v): v is string => !!v) ??
      null;
    if (!autor) return { nome: null };

    const { data: prof, error: errProf } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", autor)
      .maybeSingle();
    if (errProf) throw new Error(errProf.message);
    const nomeCadastro = ((prof as { nome: string | null } | null)?.nome ?? "").trim();
    return { nome: nomeCadastro || null };
  });
