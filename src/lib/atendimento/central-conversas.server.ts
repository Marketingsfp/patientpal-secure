import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aplicarPeriodoCentral, type PeriodoCentral } from "./periodo-central";

export async function listarPaginaCentral(
  db: SupabaseClient<Database>,
  args: PeriodoCentral & {
    clinicaId: string;
    situacao: "todas" | "abertas" | "encerradas";
    offset: number;
    limit: number;
  },
) {
  let q = db
    .from("atend_conversas")
    .select(
      "id, numero_conversa, protocolo_atendimento, protocol_number, contato_nome, whatsapp_profile_name, contato_telefone, status, owner_type, ultima_msg_em, created_at, atribuida_user_id",
    )
    .eq("clinica_id", args.clinicaId)
    .eq("is_teste", false);
  if (args.situacao === "abertas") q = q.not("status", "in", "(closed,finished)");
  if (args.situacao === "encerradas") q = q.in("status", ["closed", "finished"]);
  q = aplicarPeriodoCentral(q, args);
  const { data, error } = await q
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    conversas: rows.slice(0, args.limit).map((c) => ({ ...c, trecho: null as string | null })),
    temMais: rows.length > args.limit,
  };
}
