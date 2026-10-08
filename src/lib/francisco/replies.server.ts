import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chaveTelefone } from "@/lib/agenda/confirmacao-whatsapp";
import { pediuSaidaFrancisco } from "./config";
import { conferirErro } from "./service.server";

function canonical(numero: string) {
  const chave = chaveTelefone(numero);
  return chave ? `55${chave.slice(0, 2)}9${chave.slice(2)}` : null;
}
type Atendimento = Pick<
  typeof import("@/lib/atendimento/handoff.server"),
  "reabrirConversaPorMensagemPaciente" | "estadoConversaPorTelefone" | "encaminharParaHumano"
>;
type Db = import("@supabase/supabase-js").SupabaseClient<any>;
export async function processarRespostaFrancisco(
  p: {
    clinicaId: string;
    from: string;
    mensagemId: string;
    waMessageId: string;
    contextoId?: string;
    texto: string;
    recebidaEm?: string;
  },
  deps?: { db: Db; atendimento: () => Promise<Atendimento> },
) {
  const db = deps?.db ?? (supabaseAdmin as Db);
  const telefone = canonical(p.from);
  if (!telefone) return false;
  let q = db
    .from("francisco_envios")
    .select("*")
    .eq("clinica_id", p.clinicaId)
    .eq("telefone", telefone);
  if (p.contextoId) q = q.eq("wa_message_id", p.contextoId);
  else
    q = q
      .in("status", ["enviado", "incerto"])
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  // Enquanto a migração não existe, Francisco não interfere na Nina.
  if (["42P01", "PGRST205"].includes(error?.code ?? "")) return false;
  conferirErro(error);
  if (!data) return false;
  if (!p.contextoId) {
    // Se houve outro contato após Francisco, a resposta pertence à conversa mais recente.
    const { count, error: e } = await db
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", p.clinicaId)
      .eq("direction", "out")
      .in("to_number", [telefone, `+${telefone}`, p.from, `+${p.from}`])
      .gt("created_at", data.created_at)
      .neq("wa_message_id", data.wa_message_id ?? "");
    conferirErro(e);
    if (count) return false;
  }
  const { error: respostaErro } = await db.rpc("francisco_registrar_resposta", {
    p_clinica: p.clinicaId,
    p_telefone: telefone,
    p_saida: pediuSaidaFrancisco(p.texto),
    p_mensagem: p.waMessageId,
  });
  conferirErro(respostaErro);
  // Usa o broker do atendimento, sem mensagem da Nina e sem alterar orçamento/pagamento.
  const { reabrirConversaPorMensagemPaciente, estadoConversaPorTelefone, encaminharParaHumano } =
    await (deps?.atendimento ? deps.atendimento() : import("@/lib/atendimento/handoff.server"));
  await reabrirConversaPorMensagemPaciente({
    clinicaId: p.clinicaId,
    telefone: p.from,
    mensagemOrigemId: p.mensagemId,
    mensagemRecebidaEm: p.recebidaEm,
  });
  const conversa = await estadoConversaPorTelefone(p.clinicaId, p.from);
  if (!conversa) throw new Error("Resposta do Francisco aguarda vínculo com a conversa.");
  const resultado = await encaminharParaHumano({
    clinicaId: p.clinicaId,
    conversaId: conversa.id,
    solicitadoPor: "SISTEMA",
    avisarPaciente: false,
    departamentoNome: data.configuracao.departamento,
    motivo: pediuSaidaFrancisco(p.texto)
      ? "Francisco: paciente pediu para não receber acompanhamentos."
      : "Francisco: resposta ao acompanhamento de orçamento; continuar com a equipe humana.",
    resumo:
      "Resposta ao Francisco. A sequência automática foi interrompida. Conferir o orçamento e tratar o pagamento pelo atendimento humano.",
    dadosColetados: { agente: "francisco", orcamento_id: data.orcamento_id, envio_id: data.id },
  });
  if (!resultado.ok) throw new Error("Não foi possível encaminhar a resposta do Francisco.");
  return true;
}
export async function registrarEntregaFrancisco(
  clinicaId: string,
  statuses: Array<{ id?: string; status?: string }>,
  db: Db = supabaseAdmin as Db,
) {
  for (const s of statuses) {
    if (!s.id || !["sent", "delivered", "read", "failed"].includes(s.status ?? "")) continue;
    // Monotônico: recibo atrasado não regride leitura/entrega.
    const permitidos =
      s.status === "read"
        ? ["sent", "delivered"]
        : s.status === "delivered"
          ? ["sent"]
          : s.status === "failed"
            ? ["sent"]
            : [];
    if (!permitidos.length) continue;
    const { error } = await db
      .from("francisco_envios")
      .update({ entrega: s.status, updated_at: new Date().toISOString() })
      .eq("clinica_id", clinicaId)
      .eq("wa_message_id", s.id)
      .in("entrega", permitidos);
    if (["42P01", "PGRST205"].includes(error?.code ?? "")) return;
    conferirErro(error);
  }
}
