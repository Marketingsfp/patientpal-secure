/**
 * (Fase 2) Contagem de falhas de entendimento até a mensagem anterior deste
 * ciclo, gravada em `respostas._nina` da última decisão da Fase 1. Decisões
 * antigas (sem contagem) valem como uma falha sem marco, então não somam com
 * a atual: a regra nova nunca encaminha por causa de um registro antigo.
 */
export async function contagemAnteriorFase1(
  clinicaId: string | null,
  conversationId: string | null,
  desde?: string | null,
): Promise<import("./jev-encaminhamento").ContagemDuvida | null> {
  if (!clinicaId || !conversationId) return null;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let consulta = db
    .from("nina_jev_decisoes" as never)
    .select("respostas")
    .eq("clinica_id", clinicaId)
    .eq("conversation_id", conversationId)
    .eq("fase", "fase1_intencao");
  if (desde && Number.isFinite(Date.parse(desde))) consulta = consulta.gte("created_at", desde);
  const { data, error } = await consulta.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const respostas = (data as { respostas?: Record<string, unknown> | null }).respostas ?? null;
  const salva = respostas?.["_nina"] as Partial<import("./jev-encaminhamento").ContagemDuvida> | undefined;
  if (salva && typeof salva.falhas === "number" && typeof salva.marco === "string")
    return {
      falhas: salva.falhas,
      marco: salva.marco,
      confiancas: Array.isArray(salva.confiancas) ? salva.confiancas.filter((c) => typeof c === "number") : [],
    };
  const conf = (respostas?.["intencao"] as { confidence?: unknown } | undefined)?.confidence;
  return typeof conf === "number" && conf < 0.8 ? { falhas: 1, marco: "", confiancas: [conf] } : null;
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

/** Igual em produção e homologação: só a flag da fase na clínica decide. */
export async function jevAtivo(clinicaId: string | null, fase: FaseJev, teste: boolean): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_JEV[fase])
    .maybeSingle();
  if (error || !data) return false;
  return jevPermitido(teste, Boolean(data.ativo));
}

/** Etapa C: limites da clínica (padrão quando não há configuração ou em erro). */
export async function limitesJev(clinicaId: string | null): Promise<import("./jev-limites").LimitesJev> {
  const { normalizarLimites, LIMITES_JEV_PADRAO } = await import("./jev-limites");
  if (!clinicaId) return LIMITES_JEV_PADRAO;
  try {
    const { data } = await supabaseAdmin.from("nina_jev_limites" as never).select("*").eq("clinica_id", clinicaId).maybeSingle();
    return normalizarLimites(data as never);
  } catch {
    return LIMITES_JEV_PADRAO;
  }
}

export async function perguntarJev(
  state: unknown,
  perguntas: Record<string, PerguntaJev>,
  limiteMs: number = LIMITE_MS,
): Promise<ResultadoJev> {
  const inicio = Date.now();
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return { ok: false, motivo: "sem_chave", latencyMs: 0 };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
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
  /** Fase 1: contagem de falhas de entendimento deste turno (lida no próximo). */
  contagem?: import("./jev-encaminhamento").ContagemDuvida | null;
  /**
   * Dados da consulta que ajudam a auditar a decisão (ex.: Fase 3 — termo
   * pesquisado, tipo de atendimento, quantidade de opções). Gravados junto das
   * perguntas, também quando o Jev falha.
   */
  contexto?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("nina_jev_decisoes" as never).insert({
      clinica_id: r.clinicaId,
      conversation_id: r.conversationId,
      fase: r.fase,
      teste: r.teste,
      perguntas: r.contexto ? { chaves: Object.keys(r.perguntas), ...r.contexto } : Object.keys(r.perguntas),
      respostas: r.resultado.ok
        ? { ...r.resultado.respostas, ...(r.contagem ? { _nina: r.contagem } : {}) }
        : null,
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

/**
 * (Fase 6) Confere a resposta da Maria antes do envio. "refazer" = a Maria
 * reescreve uma vez com a instrução; já corrigida e ainda com problema =
 * "bloquear" (vai a mensagem segura). Erro/demora = "enviar" (fluxo atual).
 */
export async function conferirRespostaJev(ctx: {
  clinicaId: string;
  conversaId: string | null;
  teste: boolean;
  texto: string;
  fatos: import("./jev-conferencia").FatosTurno;
  jaCorrigida: boolean;
}): Promise<{ acao: "enviar" } | { acao: "refazer"; instrucao: string } | { acao: "bloquear" }> {
  try {
    const c = await import("./jev-conferencia");
    const perguntas = c.perguntasConferencia(ctx.fatos);
    const [resultado, limites] = await Promise.all([
      perguntarJev(c.estadoConferencia(ctx.texto, ctx.fatos), perguntas),
      limitesJev(ctx.clinicaId),
    ]);
    const problemas = resultado.ok ? c.problemasConferencia(resultado.respostas, ctx.fatos, limites.conferencia) : [];
    const registro = resultado.ok
      ? { ...resultado, respostas: { ...resultado.respostas,
          _nina: { problemas, ja_corrigida: ctx.jaCorrigida,
            agenda_consultada: ctx.fatos.agendaConsultada,
            agendamento_confirmado: ctx.fatos.agendamentoConfirmado } as never } }
      : resultado;
    await registrarDecisaoJev({ clinicaId: ctx.clinicaId, conversationId: ctx.conversaId,
      fase: "fase6_conferencia", teste: ctx.teste, perguntas, resultado: registro,
      aplicada: problemas.length > 0 });
    if (problemas.length === 0) return { acao: "enviar" };
    if (ctx.jaCorrigida) return { acao: "bloquear" };
    return { acao: "refazer", instrucao: c.instrucaoCorrecao(problemas) };
  } catch (e) {
    console.warn("[nina-jev] conferência ignorada:", e instanceof Error ? e.message : e);
    return { acao: "enviar" };
  }
}

/**
 * (Fase 7) Entende o "sim" e a escolha de horário quando as regras não
 * entenderam. Só escolhe entre opções oferecidas; abaixo de 80% = "nada".
 * Erro/demora/chave desligada = "nada" (fluxo atual).
 */
export async function interpretarEscolhaJev(ctx: {
  clinicaId: string;
  conversaId: string | null;
  teste: boolean;
  mensagem: string;
  ultimaMaria: string | null;
  situacao: import("./jev-escolha").SituacaoEscolha;
}): Promise<import("./jev-escolha").DecisaoEscolha> {
  try {
    if (!(await jevAtivo(ctx.clinicaId, "fase7_escolha", ctx.teste))) return { tipo: "nada" };
    const e = await import("./jev-escolha");
    const perguntas = e.perguntasEscolha(ctx.situacao);
    const [resultado, limites] = await Promise.all([
      perguntarJev(e.estadoEscolha(ctx.mensagem, ctx.ultimaMaria, ctx.situacao), perguntas),
      limitesJev(ctx.clinicaId),
    ]);
    const decisao = resultado.ok ? e.decisaoEscolha(resultado.respostas, ctx.situacao, limites.escolha) : { tipo: "nada" as const };
    await registrarDecisaoJev({ clinicaId: ctx.clinicaId, conversationId: ctx.conversaId,
      fase: "fase7_escolha", teste: ctx.teste, perguntas, resultado, aplicada: decisao.tipo !== "nada",
      contexto: { situacao: ctx.situacao.tipo, decisao: decisao.tipo,
        ...(decisao.tipo === "escolheu" ? { inicio: decisao.vaga.inicio, medico_id: decisao.vaga.medico_id } : {}) } });
    return decisao;
  } catch {
    return { tipo: "nada" };
  }
}

/**
 * (Fase 8) Categoria fixa do motivo da transferência. O Jev só escolhe entre
 * categorias; a frase continua da Maria. Erro, demora ou pouca certeza = motivo
 * original, sem categoria. Nunca impede a transferência.
 */
export async function categorizarMotivoJev(ctx: {
  clinicaId: string;
  conversaId: string | null;
  teste: boolean;
  motivo: string;
  resumo: string | null;
}): Promise<string> {
  try {
    const m = await import("./jev-motivo");
    if (!m.precisaClassificar(ctx.motivo)) return ctx.motivo;
    if (!(await jevAtivo(ctx.clinicaId, "fase8_motivo", ctx.teste))) return ctx.motivo;
    const perguntas = m.perguntaMotivo();
    const resultado = await perguntarJev(
      { motivo: ctx.motivo, resumo: ctx.resumo ?? "", mensagem_atual: "" },
      perguntas,
      2500,
    );
    const categoria = resultado.ok ? m.decidirCategoria(resultado.respostas["categoria"]) : null;
    await registrarDecisaoJev({
      clinicaId: ctx.clinicaId, conversationId: ctx.conversaId, fase: "fase8_motivo", teste: ctx.teste,
      perguntas, resultado, aplicada: categoria !== null,
    });
    return m.motivoComCategoria(ctx.motivo, categoria);
  } catch (e) {
    console.warn("[nina-jev] fase 8 ignorada:", e instanceof Error ? e.message : e);
    return ctx.motivo;
  }
}
