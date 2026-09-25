/**
 * (Fase 2) `duvidaAnteriorFase1`: a mensagem anterior desta conversa também
 * ficou sem entendimento (confiança da intenção abaixo de 0,8)?
 */
export async function duvidaAnteriorFase1(clinicaId: string | null, conversationId: string | null): Promise<boolean> {
  if (!clinicaId || !conversationId) return false;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db
    .from("nina_jev_decisoes" as never)
    .select("respostas")
    .eq("clinica_id", clinicaId)
    .eq("conversation_id", conversationId)
    .eq("fase", "fase1_intencao")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  const conf = (data as { respostas?: { intencao?: { confidence?: unknown } } | null }).respostas?.intencao?.confidence;
  return typeof conf === "number" && conf < 0.8;
}

/**
 * Chamada única ao Jev pelo AI Gateway (server-only). Qualquer erro, recusa
 * ou demora vira "sem decisão" — nunca derruba nem trava o atendimento.
 * Sem nova tentativa automática (regras do gateway).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FLAG_JEV,
  jevPermitido,
  validarRespostas,
  type FaseJev,
  type PerguntaJev,
  type ResultadoJev,
} from "./jev";

const URL_JEV = "https://ai.gateway.lovable.dev/v1/systemone";
export const MODELO_JEV = "typesafe/jev-latest";
/** Limite para não atrasar a resposta ao paciente; ao estourar, segue o fluxo atual. */
const LIMITE_MS = 4000;

export async function jevAtivo(clinicaId: string | null, fase: FaseJev, teste: boolean): Promise<boolean> {
  if (!teste || !clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_JEV[fase])
    .maybeSingle();
  if (error || !data) return false;
  return jevPermitido(teste, Boolean(data.ativo));
}

export async function perguntarJev(
  state: unknown,
  perguntas: Record<string, PerguntaJev>,
): Promise<ResultadoJev> {
  const inicio = Date.now();
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return { ok: false, motivo: "sem_chave", latencyMs: 0 };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), LIMITE_MS);
  try {
    const resp = await fetch(URL_JEV, {
      method: "POST",
      signal: controle.signal,
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ model: MODELO_JEV, state, questions: perguntas }),
    });
    const latencyMs = Date.now() - inicio;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { ok: false, motivo: `http_${resp.status}: ${txt.slice(0, 200)}`, status: resp.status, latencyMs };
    }
    const respostas = validarRespostas(perguntas, await resp.json());
    if (!respostas) return { ok: false, motivo: "resposta_invalida", latencyMs };
    return { ok: true, respostas, latencyMs };
  } catch (e) {
    const motivo = controle.signal.aborted ? "tempo_esgotado" : e instanceof Error ? e.message : "erro";
    return { ok: false, motivo, latencyMs: Date.now() - inicio };
  } finally {
    clearTimeout(timer);
  }
}

/** Registro best-effort da decisão, para comparar com o comportamento atual. */
export async function registrarDecisaoJev(r: {
  clinicaId: string | null;
  conversationId: string | null;
  fase: FaseJev;
  teste: boolean;
  perguntas: Record<string, PerguntaJev>;
  resultado: ResultadoJev;
  aplicada: boolean;
}): Promise<void> {
  try {
    await supabaseAdmin.from("nina_jev_decisoes" as never).insert({
      clinica_id: r.clinicaId,
      conversation_id: r.conversationId,
      fase: r.fase,
      teste: r.teste,
      perguntas: Object.keys(r.perguntas),
      respostas: r.resultado.ok ? r.resultado.respostas : null,
      aplicada: r.aplicada,
      latency_ms: r.resultado.latencyMs,
      erro: r.resultado.ok ? null : r.resultado.motivo,
    } as never);
  } catch (e) {
    console.warn("[nina-jev] falha ao registrar decisão:", e instanceof Error ? e.message : e);
  }
}

/**
 * (Fase 4) Cadastros ambíguos: o Jev só SUGERE qual cadastro combina e a
 * sugestão fica registrada para a recepção. Nunca vincula, cria ou altera.
 */
export async function sugerirCadastroJev(
  ctx: { clinicaId: string; conversaId: string | null; teste?: boolean; origem?: string },
  dados: { nome: string; data_nascimento: string; telefone: string },
): Promise<void> {
  const teste = Boolean(ctx.teste || ctx.origem === "homologacao");
  if (!(await jevAtivo(ctx.clinicaId, "fase4_cadastro", teste))) return;
  const { normalizarNome, estadoCadastro, perguntaCadastro, sugestaoCadastro } = await import("./jev-cadastro");
  const { normalizarTelefone } = await import("@/lib/atendimento/telefone");
  const { data, error } = await supabaseAdmin
    .from("pacientes")
    .select("id,nome,data_nascimento,telefone,telefone2,created_at,ativo")
    .eq("clinica_id", ctx.clinicaId)
    .eq("is_mock_data", teste)
    .eq("teste", teste)
    .or(`data_nascimento.eq.${dados.data_nascimento},data_nascimento.is.null`)
    .limit(500);
  if (error || !data) return;
  const nome = normalizarNome(dados.nome);
  const tel = normalizarTelefone(dados.telefone);
  const candidatos = (data as Array<Record<string, any>>).filter(
    (p) => normalizarNome(p.nome) === nome &&
      (normalizarTelefone(p.telefone) === tel || normalizarTelefone(p.telefone2) === tel),
  ).map((p) => ({ id: p.id, nome: p.nome, data_nascimento: p.data_nascimento, telefone: p.telefone,
    telefone2: p.telefone2, created_at: p.created_at }));
  if (candidatos.length < 2) return;
  const perguntas = perguntaCadastro(candidatos);
  const resultado = await perguntarJev(estadoCadastro(dados, candidatos), perguntas);
  const sugerido = resultado.ok ? sugestaoCadastro(resultado.respostas.cadastro, candidatos) : null;
  const registro = resultado.ok
    ? { ...resultado, respostas: { ...resultado.respostas,
        _sugestao_recepcao: { paciente_id: sugerido, candidatos: candidatos.map((c) => c.id).slice(0, 10) } as never } }
    : resultado;
  await registrarDecisaoJev({ clinicaId: ctx.clinicaId, conversationId: ctx.conversaId, fase: "fase4_cadastro",
    teste, perguntas, resultado: registro, aplicada: false });
}
