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
// IMPRIMINDO, não o de quem faturou. Aqui a resolução é feita com a chave de
// serviço, então nunca volta vazia por falta de permissão — e o nome ainda tem
// duas redes de segurança (metadados do login e e-mail) quando o cadastro está
// sem nome preenchido.
//
// Acesso: só responde a quem é membro da clínica informada, e só olha
// agendamentos que realmente pertencem a ela.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
    const { data: membro, error: errMembro } = await supabaseAdmin.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (errMembro) throw new Error(errMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    // O id do agendamento vem do cliente: confere que é mesmo desta clínica
    // antes de olhar o financeiro dele.
    const { data: ags, error: errAgs } = await supabaseAdmin
      .from("agendamentos")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .in("id", data.agendamentoIds);
    if (errAgs) throw new Error(errAgs.message);
    const ids = ((ags ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return { nome: null };

    const { data: lancs, error: errLancs } = await supabaseAdmin
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

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("nome")
      .eq("id", autor)
      .maybeSingle();
    const nomeCadastro = ((prof as { nome: string | null } | null)?.nome ?? "").trim();
    if (nomeCadastro) return { nome: nomeCadastro };

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(autor);
    const meta = ((u?.user?.user_metadata as { nome?: string } | undefined)?.nome ?? "").trim();
    return { nome: meta || u?.user?.email || null };
  });
