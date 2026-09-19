/**
 * Gravação das provas e dos treinos do Coach — só o servidor escreve.
 *
 * As políticas de gravação do navegador foram removidas: criar prova, guardar
 * resposta, fechar nota, abrir treino, registrar turno e encerrar treino
 * acontecem aqui, com conferência de dono e de clínica antes de cada escrita.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { filtroDoAtendente } from "./identidade";
import type { QuestaoCompleta } from "./sessao-calculo";

type Admin = SupabaseClient<any, any, any>;
type Db = SupabaseClient<any, any, any>;

/** Cliente com permissão total — usado só depois de conferir quem chamou. */
export async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** A pessoa é gestora do Coach nesta clínica? */
export async function ehGestor(db: Db, clinicaId: string): Promise<boolean> {
  const { data } = await db.rpc("coach_pode_gerir", { _clinica_id: clinicaId });
  return Boolean(data);
}

/** Erro curto, do jeito que a atendente pode ler. */
export function erro(msg: string): never {
  throw new Error(msg);
}

type LinhaDono = { id: string; clinica_id: string; user_id: string | null; status?: string | null };

/** Confere que a linha é da pessoa (ou da gestão) e da clínica informada. */
export async function conferirDono(
  db: Db,
  linha: LinhaDono | null,
  userId: string,
  clinicaId: string,
): Promise<void> {
  if (!linha) erro("Registro não encontrado.");
  if (linha.clinica_id !== clinicaId) erro("Registro de outra clínica.");
  if (linha.user_id === userId) return;
  if (await ehGestor(db, clinicaId)) return;
  erro("Este registro não é seu.");
}

/**
 * Só a gestão pode marcar algo como simulação (assim ninguém escapa da meta
 * marcando a própria prova como teste).
 */
export async function simulacaoPermitida(
  db: Db,
  clinicaId: string,
  pedido: boolean | undefined,
): Promise<boolean> {
  if (!pedido) return false;
  return await ehGestor(db, clinicaId);
}

/** Dono da linha: a própria pessoa, ou a atendente treinada numa simulação. */
export async function donoDaLinha(
  db: Db,
  clinicaId: string,
  userId: string,
  alvoUserId: string | null | undefined,
): Promise<string> {
  if (!alvoUserId || alvoUserId === userId) return userId;
  return (await ehGestor(db, clinicaId)) ? alvoUserId : userId;
}

/* ----------------------------- Prova ----------------------------- */

export type ProvaRow = {
  id: string;
  clinica_id: string;
  user_id: string | null;
  atendente: string;
  status: string;
  questoes: QuestaoCompleta[];
  respostas: number[];
  feedback: unknown;
  created_at: string;
};

export async function lerProva(a: Admin, id: string): Promise<ProvaRow | null> {
  const { data } = await a
    .from("coach_provas")
    .select("id, clinica_id, user_id, atendente, status, questoes, respostas, feedback, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ProvaRow) ?? null;
}

export async function provaEmAndamentoDe(
  a: Admin,
  clinicaId: string,
  userId: string,
): Promise<ProvaRow | null> {
  const { data } = await a
    .from("coach_provas")
    .select("id, clinica_id, user_id, atendente, status, questoes, respostas, feedback, created_at")
    .eq("clinica_id", clinicaId)
    .eq("user_id", userId)
    .eq("status", "em_andamento")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as ProvaRow) ?? null;
}

/* ----------------------------- Treino ----------------------------- */

export type TreinoMsg = { role: "cliente" | "atendente"; content: string };

export type TreinoRow = {
  id: string;
  clinica_id: string;
  user_id: string | null;
  atendente: string;
  status: string;
  cenario: string;
  perfil_cliente: string;
  pontos_fracos: string[];
  mensagens: TreinoMsg[];
  modo: string;
  created_at: string;
};

export async function lerTreino(a: Admin, id: string): Promise<TreinoRow | null> {
  const { data } = await a
    .from("coach_roleplay_sessions")
    .select(
      "id, clinica_id, user_id, atendente, status, cenario, perfil_cliente, pontos_fracos, mensagens, modo, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as TreinoRow) ?? null;
}

/** Fecha sem nota os treinos deixados em aberto há mais de 2 horas. */
export async function expirarTreinosAntigos(a: Admin): Promise<void> {
  try {
    await a.rpc("coach_expirar_treinos");
  } catch {
    /* limpeza nunca derruba o treino de quem está usando agora */
  }
}

/* --------------------- Material da atendente --------------------- */

export type ExemploAtendimento = {
  titulo?: string;
  resumo?: string;
  pontos_positivos?: string[];
  pontos_negativos?: string[];
  frases?: { tipo: string; trecho: string; motivo: string }[];
  checklist?: { item: string; status: string }[];
  transcricao?: string;
};

const FRACOS_PADRAO = [
  "Não oferece horário específico para fechar o agendamento",
  "Não confirma nome e telefone do paciente",
  "Não informa valor e forma de pagamento com segurança",
  "Não contorna objeção de preço",
  "Não explica preparo do exame",
  "Encerra a conversa sem agendar",
];

/**
 * Avaliações reais da atendente, lidas no servidor. Antes o navegador montava
 * esses exemplos e mandava no corpo da chamada — dava para trocar tudo.
 */
export async function exemplosDaAtendente(
  db: Db,
  clinicaId: string,
  alvoUserId: string | null,
  atendente: string,
  limite = 6,
): Promise<ExemploAtendimento[]> {
  const { data } = await db
    .from("coach_analises")
    .select("titulo,resultado")
    .eq("clinica_id", clinicaId)
    .or(filtroDoAtendente(alvoUserId, atendente))
    .order("created_at", { ascending: false })
    .limit(limite);

  type Resultado = {
    resumo?: string;
    pontos_positivos?: string[];
    pontos_negativos?: string[];
    frases_destaque?: { tipo: string; trecho: string; motivo: string }[];
    checklist_resultado?: { item: string; status: string }[];
    transcricao?: string;
  };

  const linhas = (data ?? []) as unknown as { titulo?: string; resultado?: Resultado }[];
  const exemplos: ExemploAtendimento[] = linhas.map((r) => ({
    titulo: r.titulo?.slice(0, 300),
    resumo: r.resultado?.resumo?.slice(0, 2000),
    pontos_positivos: (r.resultado?.pontos_positivos ?? []).slice(0, 12),
    pontos_negativos: (r.resultado?.pontos_negativos ?? []).slice(0, 12),
    frases: (r.resultado?.frases_destaque ?? []).slice(0, 12).map((f) => ({
      tipo: String(f.tipo).slice(0, 30),
      trecho: String(f.trecho).slice(0, 800),
      motivo: String(f.motivo).slice(0, 800),
    })),
    checklist: (r.resultado?.checklist_resultado ?? []).slice(0, 30).map((c) => ({
      item: String(c.item).slice(0, 300),
      status: String(c.status).slice(0, 30),
    })),
    transcricao: r.resultado?.transcricao?.slice(0, 8000),
  }));

  if (exemplos.length) return exemplos;

  // Sem análises: aproveita os treinos já feitos.
  const { data: rp } = await db
    .from("coach_roleplay_sessions")
    .select("cenario,resumo,acertos,melhorias,pontos_fracos,mensagens,modo")
    .eq("clinica_id", clinicaId)
    .eq("simulacao_gestor", false)
    .or(filtroDoAtendente(alvoUserId, atendente))
    .order("created_at", { ascending: false })
    .limit(limite);

  const treinos = (rp ?? []) as unknown as {
    cenario?: string;
    resumo?: string;
    acertos?: string[];
    melhorias?: string[];
    pontos_fracos?: string[];
    mensagens?: { role?: string; content?: string }[];
    modo?: string;
  }[];

  const deTreinos: ExemploAtendimento[] = treinos.map((r) => ({
    titulo: `Treinamento ${r.modo === "texto" ? "WhatsApp" : "ligação"}${
      r.cenario ? ` — ${String(r.cenario).slice(0, 200)}` : ""
    }`.slice(0, 300),
    resumo: String(r.resumo ?? "").slice(0, 2000),
    pontos_positivos: (Array.isArray(r.acertos) ? r.acertos : [])
      .slice(0, 12)
      .map((s) => String(s).slice(0, 500)),
    pontos_negativos: [
      ...(Array.isArray(r.melhorias) ? r.melhorias : []),
      ...(Array.isArray(r.pontos_fracos) ? r.pontos_fracos : []),
    ]
      .slice(0, 12)
      .map((s) => String(s).slice(0, 500)),
    frases: [],
    checklist: [],
    transcricao: (Array.isArray(r.mensagens) ? r.mensagens : [])
      .map((m) => `${m.role === "atendente" ? "Atendente" : "Paciente"}: ${String(m.content ?? "")}`)
      .join("\n")
      .slice(0, 8000),
  }));

  if (deTreinos.length) return deTreinos;

  return [
    {
      titulo: "Prova padrão de conversão de agendamento",
      resumo:
        "Sem atendimentos analisados ainda. Gere questões sobre condução da conversa, oferta de horários, tratamento de objeções, confirmação de dados e domínio dos serviços, valores e horários da clínica.",
      pontos_positivos: [],
      pontos_negativos: FRACOS_PADRAO.slice(0, 4),
      frases: [],
      checklist: [],
    },
  ];
}

/** Pontos fracos recorrentes da atendente, apurados no servidor. */
export async function pontosFracosDaAtendente(
  db: Db,
  clinicaId: string,
  alvoUserId: string | null,
  atendente: string,
): Promise<{ fracos: string[]; exemplos: ExemploAtendimento[] }> {
  const exemplos = await exemplosDaAtendente(db, clinicaId, alvoUserId, atendente, 20);
  const contagem = new Map<string, number>();
  for (const ex of exemplos) {
    for (const p of ex.pontos_negativos ?? []) {
      const chave = String(p).trim().toLowerCase();
      if (!chave) continue;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  }
  const fracos = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([texto]) => texto.charAt(0).toUpperCase() + texto.slice(1));
  return {
    fracos: fracos.length ? fracos : FRACOS_PADRAO,
    exemplos: exemplos.slice(0, 5),
  };
}
