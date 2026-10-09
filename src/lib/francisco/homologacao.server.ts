import type { SupabaseClient } from "@supabase/supabase-js";
import { conferirErro, type CursorFrancisco } from "./service.server";
import {
  aplicarAcaoTesteFrancisco,
  iniciarTesteFrancisco,
  type AcaoTesteFrancisco,
  type InicioTesteFrancisco,
} from "./homologacao";

// Homologação reutiliza apenas o histórico do Francisco. Não importa transporte,
// runner, financeiro, webhook, broker humano ou pipeline da Nina.
type Db = SupabaseClient<any>;
type EventoTeste = {
  id: string;
  created_at: string;
  dados: { sessao: string; inicio?: InicioTesteFrancisco; acao?: AcaoTesteFrancisco };
};
const INICIO = "homologacao_chat_inicio";
const ACAO = "homologacao_chat_acao";

export async function listarTestesFrancisco(
  db: Db,
  clinicaId: string,
  ator: string,
  cursor?: CursorFrancisco,
) {
  let q = db
    .from("francisco_eventos")
    .select("id,created_at,dados")
    .eq("clinica_id", clinicaId)
    .eq("ator", ator)
    .eq("tipo", INICIO)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(21);
  if (cursor)
    q = q.or(`created_at.lt.${cursor.em},and(created_at.eq.${cursor.em},id.lt.${cursor.id})`);
  const { data, error } = await q;
  conferirErro(error);
  const rows = (data ?? []) as EventoTeste[];
  const itens = rows
    .slice(0, 20)
    .map((r) => ({ id: r.id, em: r.created_at, etapa: r.dados.inicio!.etapa }));
  const ultimo = itens.at(-1);
  return { itens, proximo: rows.length > 20 && ultimo ? { em: ultimo.em, id: ultimo.id } : null };
}

export async function carregarTesteFrancisco(
  db: Db,
  clinicaId: string,
  ator: string,
  sessaoId: string,
) {
  const { data, error } = await db
    .from("francisco_eventos")
    .select("id,created_at,dados")
    .eq("clinica_id", clinicaId)
    .eq("ator", ator)
    .eq("tipo", INICIO)
    .eq("id", sessaoId)
    .maybeSingle();
  conferirErro(error);
  if (!data) throw new Error("Conversa de teste não encontrada para este usuário e clínica.");
  const raiz = data as EventoTeste;
  let sessao = iniciarTesteFrancisco(raiz.id, raiz.created_at, raiz.dados.inicio!);
  // Pagina todas as ações, sem truncar silenciosamente conversas extensas.
  let cursor: CursorFrancisco | undefined;
  for (;;) {
    let q = db
      .from("francisco_eventos")
      .select("id,created_at,dados")
      .eq("clinica_id", clinicaId)
      .eq("ator", ator)
      .eq("tipo", ACAO)
      .eq("dados->>sessao", sessaoId)
      .order("created_at")
      .order("id")
      .limit(100);
    if (cursor)
      q = q.or(`created_at.gt.${cursor.em},and(created_at.eq.${cursor.em},id.gt.${cursor.id})`);
    const lote = await q;
    conferirErro(lote.error);
    const eventos = (lote.data ?? []) as EventoTeste[];
    for (const evento of eventos) {
      // Ações D4 concorrentes são descartadas na projeção após interrupção.
      if (evento.dados.acao?.tipo === "d4" && (sessao.estado !== "aguardando" || sessao.d4Enviado))
        continue;
      sessao = aplicarAcaoTesteFrancisco(sessao, evento.id, evento.created_at, evento.dados.acao!);
    }
    if (eventos.length < 100) return sessao;
    const ultimo = eventos.at(-1)!;
    cursor = { em: ultimo.created_at, id: ultimo.id };
  }
}

export async function iniciarConversaTesteFrancisco(
  db: Db,
  clinicaId: string,
  ator: string,
  id: string,
  inicio: InicioTesteFrancisco,
) {
  iniciarTesteFrancisco(id, new Date().toISOString(), inicio);
  const { error } = await db.from("francisco_eventos").insert({
    id,
    clinica_id: clinicaId,
    ator,
    tipo: INICIO,
    dados: { sessao: id, inicio },
  });
  if (error?.code !== "23505") conferirErro(error);
  return carregarTesteFrancisco(db, clinicaId, ator, id);
}

export async function agirConversaTesteFrancisco(
  db: Db,
  clinicaId: string,
  ator: string,
  id: string,
  sessaoId: string,
  acao: AcaoTesteFrancisco,
) {
  const sessao = await carregarTesteFrancisco(db, clinicaId, ator, sessaoId);
  // Retomada idempotente após perda de resposta: o mesmo comando não duplica bolhas.
  const existente = await db
    .from("francisco_eventos")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("ator", ator)
    .eq("tipo", ACAO)
    .eq("dados->>sessao", sessaoId)
    .eq("id", id)
    .maybeSingle();
  conferirErro(existente.error);
  if (existente.data) return sessao;
  aplicarAcaoTesteFrancisco(sessao, id, new Date().toISOString(), acao);
  const { error } = await db.from("francisco_eventos").insert({
    id,
    clinica_id: clinicaId,
    ator,
    tipo: ACAO,
    dados: { sessao: sessaoId, acao },
  });
  if (error?.code === "23505") {
    const retomada = await db
      .from("francisco_eventos")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("ator", ator)
      .eq("tipo", ACAO)
      .eq("dados->>sessao", sessaoId)
      .eq("id", id)
      .maybeSingle();
    conferirErro(retomada.error);
    if (!retomada.data) throw new Error("Identificador de ação já utilizado por outro teste.");
  } else conferirErro(error);
  return carregarTesteFrancisco(db, clinicaId, ator, sessaoId);
}
