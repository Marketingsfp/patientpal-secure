/**
 * Ambiente de testes da Nina — 10, 20 ou 30 conversas simultâneas.
 *
 * O navegador conduz as conversas em paralelo: para cada lead, pede a
 * próxima mensagem ao paciente difícil (`turnoPacienteAmbiente`), envia pela
 * mesma função do console (`enviarMensagemTeste`, núcleo real da Nina) e, ao
 * fim, chama o juiz (`avaliarConversaAmbiente`).
 *
 * Teste contínuo: cada lead abre a próxima conversa assim que a anterior
 * termina (`novaConversaAmbiente`), dentro do tempo máximo da rodada. Com
 * áudio e foto ligados, o paciente às vezes manda nota de voz (sintetizada
 * aqui e transcrita pelo mesmo caminho do WhatsApp) ou a foto do pedido.
 *
 * Estado: cada conversa é uma linha de `nina_teste_simulacoes` (persona com o
 * modo e o id da rodada); o resultado do juiz vai para `nina_teste_avaliacoes`.
 * Acesso: membro ativo com perfil que pode simular atendimento.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MODOS_PACIENTE, modoDaPosicao, modoPorId } from "@/lib/nina/ambiente-testes/modos";
import {
  LIMITES_AMBIENTE,
  SCHEMA_PACIENTE,
  entradaPaciente,
  instrucoesPaciente,
  lerAcaoPaciente,
  turnosPermitidos,
} from "@/lib/nina/ambiente-testes/paciente";
import {
  SCHEMA_JUIZ,
  type FalhaJuiz,
  VERSAO_RUBRICA_AMBIENTE,
  entradaJuiz,
  instrucoesJuiz,
  lerResultadoJuiz,
} from "@/lib/nina/ambiente-testes/juiz";
import { sortearAssuntos } from "@/lib/nina/ambiente-testes/assuntos";
import { MODELO_SOL } from "@/lib/nina/avaliador-sol";

const AMBIENTE = "ambiente-testes-v1";

async function exigirAcesso(context: { supabase: any; userId: string }, clinicaId: string) {
  // Administração e supervisão (a telefonia não vê treinamento da Nina).
  const { data: vinculo } = await context.supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", context.userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  const { perfilPodeSimularAtendimento } = await import("@/lib/atendimento/conversas-teste");
  if (!perfilPodeSimularAtendimento(vinculo?.role) || vinculo?.role === "telefonia")
    throw new Error("Sem acesso ao ambiente de testes desta clínica.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Persona = {
  ambiente: string;
  rodada: string;
  modo: string;
  posicao: number;
  /** Áudio e foto do pedido ligados nesta rodada. */
  midia?: boolean;
};

function persona(v: unknown): Persona | null {
  const p = v as Partial<Persona> | null;
  return p?.ambiente === AMBIENTE && p.rodada && p.modo ? (p as Persona) : null;
}

/** Leads do ambiente e os modos (um por lead), para a tela montar a grade. */
export const prepararAmbienteTestes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const { garantirLeadsAmbiente } = await import("@/lib/nina/ambiente-testes.server");
    const leads = await garantirLeadsAmbiente(admin, data.clinicaId);
    return {
      leads: leads.map((l, i) => ({ leadId: l.id, indice: l.indice, modo: modoDaPosicao(i).id })),
      modos: MODOS_PACIENTE.map(({ id, nome, resumo }) => ({ id, nome, resumo })),
      limites: {
        turnosPadrao: LIMITES_AMBIENTE.turnosPadrao,
        turnosMin: LIMITES_AMBIENTE.turnosMin,
        turnosMax: LIMITES_AMBIENTE.turnosMax,
      },
    };
  });

/** Reinicia os leads da rodada (10, 20 ou 30), sorteia os assuntos e registra a rodada. */
export const iniciarRodadaAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        turnos: z.number().int().min(1).max(50).optional(),
        quantidade: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
        midia: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const srv = await import("@/lib/nina/ambiente-testes.server");
    const { resetarLeadTeste } = await import("@/lib/nina/teste-console.server");
    const todos = await srv.garantirLeadsAmbiente(admin, data.clinicaId);
    // A rodada usa os primeiros leads (10 → 11 a 20; 20 → 11 a 30; 30 → todos).
    const leads = todos.slice(0, data.quantidade ?? 20);
    const ids = todos.map((l) => l.id);

    // Uma rodada por vez: o que ficou "executando" de antes é encerrado.
    await admin
      .from("nina_teste_simulacoes")
      .update({
        status: "parada",
        motivo_fim: "nova rodada",
        finalizado_em: new Date().toISOString(),
      })
      .eq("clinica_id", data.clinicaId)
      .in("lead_id", ids)
      .eq("status", "executando");

    // Conversa nova e sem memória em cada lead (mesmo reinício do botão do console).
    for (const l of leads)
      if (l.conversa_id)
        await resetarLeadTeste(admin, {
          clinicaId: data.clinicaId,
          leadId: l.id,
          conversaId: l.conversa_id,
          userId: context.userId,
          removerAgendamentos: true,
          origem: "ambiente_testes",
          manual: true,
        });

    const assuntos = sortearAssuntos(
      leads.map((_, i) => modoDaPosicao(i).assunto),
      await srv.catalogoParaAssuntos(admin, data.clinicaId),
    );
    const rodada = crypto.randomUUID();
    const turnos = turnosPermitidos(data.turnos);
    const linhas = leads.map((l, i) => ({
      clinica_id: data.clinicaId,
      lead_id: l.id,
      modelo: MODELO_SOL,
      provedor: "lovable-ai-gateway",
      cenario: assuntos[i]!,
      persona: {
        ambiente: AMBIENTE,
        rodada,
        modo: modoDaPosicao(i).id,
        posicao: i + 1,
        midia: !!data.midia,
      },
      max_turnos: turnos,
      max_mensagens: turnos,
      max_duracao_s: 3600,
      max_tokens: LIMITES_AMBIENTE.tokensPorConversa,
      timeout_s: 180,
      max_custo_creditos: 0,
      creditos_por_mil_tokens: 0,
      status: "executando",
      turnos: 0,
      input_tokens: 0,
      output_tokens: 0,
      criado_por: context.userId,
    }));
    const { data: criadas, error } = await admin
      .from("nina_teste_simulacoes")
      .insert(linhas)
      .select("id, lead_id, cenario, persona");
    if (error) throw new Error(error.message);
    return {
      rodada,
      turnos,
      itens: ((criadas ?? []) as any[])
        .map((s) => ({
          simulacaoId: s.id as string,
          leadId: s.lead_id as string,
          assunto: s.cenario as string,
          modo: (s.persona as Persona).modo,
          posicao: (s.persona as Persona).posicao,
        }))
        .sort((a, b) => a.posicao - b.posicao),
    };
  });

/**
 * Teste contínuo: abre a próxima conversa de um lead na MESMA rodada, assim
 * que a anterior termina, para a carga ficar constante. Para sozinho no tempo
 * máximo da rodada ou no teto de conversas.
 */
export const novaConversaAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        rodada: z.string().uuid(),
        leadId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const srv = await import("@/lib/nina/ambiente-testes.server");
    const { data: daRodada, error } = await admin
      .from("nina_teste_simulacoes")
      .select("id, lead_id, cenario, persona, status, max_turnos, created_at")
      .eq("clinica_id", data.clinicaId)
      .contains("persona", { ambiente: AMBIENTE, rodada: data.rodada })
      .order("created_at", { ascending: true })
      .limit(LIMITES_AMBIENTE.conversasMaxRodada + 1);
    if (error) throw new Error(error.message);
    const sims = (daRodada ?? []) as any[];
    const primeira = sims[0];
    const p0 = persona(primeira?.persona);
    if (!primeira || !p0) throw new Error("Rodada do ambiente de testes não encontrada.");
    if (Date.now() - Date.parse(primeira.created_at) >= LIMITES_AMBIENTE.duracaoMaxMin * 60_000)
      return { fim: true as const, motivo: "tempo máximo do teste contínuo" };
    if (sims.length >= LIMITES_AMBIENTE.conversasMaxRodada)
      return { fim: true as const, motivo: "teto de conversas da rodada" };

    // Lugar do lead na rodada (ordem da primeira leva) → posição única da conversa nova.
    const ordemLeads: string[] = [];
    for (const s of sims) if (!ordemLeads.includes(s.lead_id)) ordemLeads.push(s.lead_id);
    const lugar = ordemLeads.indexOf(data.leadId);
    if (lugar < 0) throw new Error("Este lead não faz parte da rodada.");
    const anteriores = sims.filter((s) => s.lead_id === data.leadId);

    const { data: lead, error: erroLead } = await admin
      .from("nina_teste_leads")
      .select("id, indice, conversa_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.leadId)
      .gte("indice", srv.PRIMEIRO_LEAD_AMBIENTE)
      .lt("indice", srv.PRIMEIRO_LEAD_AMBIENTE + srv.TOTAL_LEADS_AMBIENTE)
      .maybeSingle();
    if (erroLead) throw new Error(erroLead.message);
    if (!lead) throw new Error("Lead do ambiente de testes não encontrado.");

    // A conversa anterior deste lead termina aqui, caso tenha ficado aberta.
    await admin
      .from("nina_teste_simulacoes")
      .update({
        status: "concluida",
        motivo_fim: "fim da conversa",
        finalizado_em: new Date().toISOString(),
      })
      .in(
        "id",
        anteriores.map((s) => s.id),
      )
      .eq("status", "executando");

    if (lead.conversa_id) {
      const { resetarLeadTeste } = await import("@/lib/nina/teste-console.server");
      await resetarLeadTeste(admin, {
        clinicaId: data.clinicaId,
        leadId: lead.id,
        conversaId: lead.conversa_id,
        userId: context.userId,
        removerAgendamentos: true,
        origem: "ambiente_testes",
        manual: true,
      });
    }

    // Assunto novo: evita os já usados na rodada enquanto houver opções.
    const modo = modoDaPosicao(lead.indice - srv.PRIMEIRO_LEAD_AMBIENTE);
    const usados = new Set(sims.map((s) => String(s.cenario)));
    const catalogo = await srv.catalogoParaAssuntos(admin, data.clinicaId);
    const consultas = catalogo.consultas.filter(
      (n) => !usados.has(`consulta de ${n.toLowerCase()}`),
    );
    const exames = catalogo.exames.filter((n) => !usados.has(n));
    const [assunto] = sortearAssuntos([modo.assunto], {
      consultas: consultas.length ? consultas : catalogo.consultas,
      exames: exames.length ? exames : catalogo.exames,
    });
    const posicao = anteriores.length * ordemLeads.length + lugar + 1;
    const { data: criada, error: erroNova } = await admin
      .from("nina_teste_simulacoes")
      .insert({
        clinica_id: data.clinicaId,
        lead_id: lead.id,
        modelo: MODELO_SOL,
        provedor: "lovable-ai-gateway",
        cenario: assunto!,
        persona: {
          ambiente: AMBIENTE,
          rodada: data.rodada,
          modo: modo.id,
          posicao,
          midia: !!p0.midia,
        },
        max_turnos: primeira.max_turnos,
        max_mensagens: primeira.max_turnos,
        max_duracao_s: 3600,
        max_tokens: LIMITES_AMBIENTE.tokensPorConversa,
        timeout_s: 180,
        max_custo_creditos: 0,
        creditos_por_mil_tokens: 0,
        status: "executando",
        turnos: 0,
        input_tokens: 0,
        output_tokens: 0,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (erroNova) throw new Error(erroNova.message);
    return {
      fim: false as const,
      item: {
        simulacaoId: criada.id as string,
        leadId: lead.id as string,
        assunto: assunto!,
        modo: modo.id,
        posicao,
      },
    };
  });

/** Próxima mensagem do paciente difícil (lê a conversa do banco, nunca do navegador). */
export const turnoPacienteAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), simulacaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const srv = await import("@/lib/nina/ambiente-testes.server");
    const { data: sim, error } = await admin
      .from("nina_teste_simulacoes")
      .select(
        "id, lead_id, cenario, persona, status, turnos, max_turnos, input_tokens, output_tokens",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.simulacaoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const p = persona(sim?.persona);
    const modo = modoPorId(p?.modo);
    if (!sim || !p || !modo) throw new Error("Conversa do ambiente de testes não encontrada.");
    if (sim.status !== "executando")
      return { acao: "encerrar" as const, mensagem: "", motivo: "conversa já encerrada" };
    if (sim.turnos >= sim.max_turnos) {
      await admin
        .from("nina_teste_simulacoes")
        .update({
          status: "concluida",
          motivo_fim: "limite de mensagens",
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", sim.id);
      return { acao: "encerrar" as const, mensagem: "", motivo: "limite de mensagens" };
    }

    // Teto de tokens da rodada inteira (todas as conversas somadas).
    const { data: daRodada } = await admin
      .from("nina_teste_simulacoes")
      .select("input_tokens, output_tokens")
      .eq("clinica_id", data.clinicaId)
      .contains("persona", { ambiente: AMBIENTE, rodada: p.rodada });
    const gastos = ((daRodada ?? []) as any[]).reduce(
      (t, s) => t + (s.input_tokens ?? 0) + (s.output_tokens ?? 0),
      0,
    );
    const teto = Math.min(
      LIMITES_AMBIENTE.tokensPorConversa * Math.max(1, (daRodada ?? []).length),
      LIMITES_AMBIENTE.tokensRodadaMax,
    );
    if (gastos >= teto) {
      await admin
        .from("nina_teste_simulacoes")
        .update({
          status: "parada",
          motivo_fim: "teto de tokens da rodada",
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", sim.id);
      return { acao: "encerrar" as const, mensagem: "", motivo: "teto de tokens da rodada" };
    }

    const { data: lead } = await admin
      .from("nina_teste_leads")
      .select("conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", sim.lead_id)
      .maybeSingle();
    const turnos = await srv.turnosParaPaciente(admin, data.clinicaId, lead?.conversa_id ?? null);
    const r = await srv.chamarClaudeJson(
      "paciente_dificil",
      instrucoesPaciente(modo, sim.cenario, !!p.midia),
      entradaPaciente(turnos),
      SCHEMA_PACIENTE as unknown as Record<string, unknown>,
      600,
    );
    const acao = lerAcaoPaciente(r.texto, !!p.midia);
    await admin
      .from("nina_teste_simulacoes")
      .update({
        // A conversa nasce na primeira mensagem; fica guardada para a revisão.
        ...(lead?.conversa_id ? { conversa_id: lead.conversa_id, ciclo_id: lead.ciclo_id } : {}),
        turnos: sim.turnos + (acao.acao === "enviar" ? 1 : 0),
        input_tokens: (sim.input_tokens ?? 0) + r.inputTokens,
        output_tokens: (sim.output_tokens ?? 0) + r.outputTokens,
        ...(acao.acao === "encerrar"
          ? {
              status: "concluida",
              motivo_fim: acao.motivo || "paciente encerrou",
              finalizado_em: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", sim.id);

    // Nota de voz: a fala do paciente vira áudio aqui; a transcrição acontece
    // no envio, pelo mesmo caminho do WhatsApp. Sem áudio, segue como texto.
    let audio: { base64: string; mime: "audio/ogg" | "audio/mpeg" } | null = null;
    if (acao.anexo === "audio") {
      const { sintetizarFala } = await import("@/lib/nina-audio.server");
      const fala = await sintetizarFala(acao.mensagem).catch(() => null);
      if (fala && (fala.mime === "audio/ogg" || fala.mime === "audio/mpeg"))
        audio = { base64: Buffer.from(fala.bytes).toString("base64"), mime: fala.mime };
    }
    return { ...acao, anexo: acao.anexo === "audio" && !audio ? "nenhum" : acao.anexo, audio };
  });

/** Encerra uma conversa (ou a rodada inteira) sem apagar nada. */
export const encerrarConversaAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        simulacaoIds: z.array(z.string().uuid()).min(1).max(30),
        status: z.enum(["concluida", "parada", "erro"]),
        motivo: z.string().max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    await admin
      .from("nina_teste_simulacoes")
      .update({
        status: data.status,
        motivo_fim: data.motivo,
        ...(data.status === "erro" ? { erro: data.motivo } : {}),
        finalizado_em: new Date().toISOString(),
      })
      .eq("clinica_id", data.clinicaId)
      .in("id", data.simulacaoIds)
      .eq("status", "executando");
    return { ok: true };
  });

/** Juiz: lê a conversa concluída e grava as falhas da Nina. */
export const avaliarConversaAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), simulacaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const srv = await import("@/lib/nina/ambiente-testes.server");
    const { data: sim } = await admin
      .from("nina_teste_simulacoes")
      .select("id, lead_id, ciclo_id, conversa_id, cenario, persona")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.simulacaoId)
      .maybeSingle();
    const p = persona(sim?.persona);
    const modo = modoPorId(p?.modo);
    if (!sim || !p || !modo) throw new Error("Conversa do ambiente de testes não encontrada.");
    const { data: lead } = await admin
      .from("nina_teste_leads")
      .select("conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", sim.lead_id)
      .maybeSingle();
    const conversaId = (sim.conversa_id as string | null) ?? lead?.conversa_id ?? null;
    const linhas = await srv.transcricaoParaJuiz(admin, data.clinicaId, conversaId);
    const inicio = Date.now();
    const r = await srv.chamarClaudeJson(
      "juiz_testes",
      instrucoesJuiz(),
      [{ role: "user", content: entradaJuiz(modo, sim.cenario, linhas) }],
      SCHEMA_JUIZ as unknown as Record<string, unknown>,
      4000,
    );
    const j = lerResultadoJuiz(r.texto);
    const { error } = await admin.from("nina_teste_avaliacoes").insert({
      clinica_id: data.clinicaId,
      lead_id: sim.lead_id,
      conversa_id: conversaId,
      ciclo_id: (sim.ciclo_id as string | null) ?? lead?.ciclo_id ?? null,
      simulacao_id: sim.id,
      modelo: MODELO_SOL,
      versao_rubrica: VERSAO_RUBRICA_AMBIENTE,
      status: "concluida",
      resultado: j.resultado,
      score: j.nota,
      resumo: j.resumo,
      dimensoes: { acertos: j.acertos, modo: modo.id, assunto: sim.cenario, rodada: p.rodada },
      achados: j.falhas,
      evidencias: [],
      mensagens_avaliadas: linhas.length,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      latency_ms: Date.now() - inicio,
      criado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    return j;
  });

/** Rodadas anteriores (resumo) e, com `rodada`, o detalhe de cada conversa. */
export const listarRodadasAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), rodada: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    let consulta = admin
      .from("nina_teste_simulacoes")
      .select(
        "id, lead_id, conversa_id, cenario, persona, status, turnos, motivo_fim, input_tokens, output_tokens, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(data.rodada ? LIMITES_AMBIENTE.conversasMaxRodada : 1500);
    consulta = data.rodada
      ? consulta.contains("persona", { ambiente: AMBIENTE, rodada: data.rodada })
      : consulta.contains("persona", { ambiente: AMBIENTE });
    const { data: sims, error } = await consulta;
    if (error) throw new Error(error.message);
    const lista = (sims ?? []) as any[];
    const { data: avals } = lista.length
      ? await admin
          .from("nina_teste_avaliacoes")
          .select(
            "simulacao_id, resultado, score, resumo, achados, dimensoes, conversa_id, created_at",
          )
          .eq("clinica_id", data.clinicaId)
          .in(
            "simulacao_id",
            lista.map((s) => s.id),
          )
      : { data: [] };
    const avalPorSim = new Map<string, any>();
    for (const a of (avals ?? []) as any[]) avalPorSim.set(a.simulacao_id, a);
    const conversas = lista.map((s) => {
      const p = persona(s.persona)!;
      const a = avalPorSim.get(s.id);
      return {
        simulacaoId: s.id as string,
        rodada: p.rodada,
        posicao: p.posicao,
        modo: p.modo,
        assunto: s.cenario as string,
        status: s.status as string,
        turnos: s.turnos as number,
        motivoFim: (s.motivo_fim as string | null) ?? null,
        tokens: (s.input_tokens ?? 0) + (s.output_tokens ?? 0),
        criadaEm: s.created_at as string,
        conversaId: (s.conversa_id as string | null) ?? (a?.conversa_id as string | null) ?? null,
        avaliacao: a
          ? {
              resultado: a.resultado as string,
              nota: a.score as number,
              resumo: a.resumo as string,
              falhas: (a.achados ?? []) as FalhaJuiz[],
              acertos: (a.dimensoes?.acertos ?? []) as string[],
            }
          : null,
      };
    });
    const porRodada = new Map<string, typeof conversas>();
    for (const c of conversas) porRodada.set(c.rodada, [...(porRodada.get(c.rodada) ?? []), c]);
    const rodadas = [...porRodada.entries()].map(([rodada, itens]) => {
      const notas = itens
        .map((i) => i.avaliacao?.nota)
        .filter((n): n is number => typeof n === "number");
      return {
        rodada,
        criadaEm: itens.map((i) => i.criadaEm).sort()[0]!,
        conversas: itens.length,
        avaliadas: notas.length,
        notaMedia: notas.length
          ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length)
          : null,
        falhas: itens.reduce((t, i) => t + (i.avaliacao?.falhas.length ?? 0), 0),
        tokens: itens.reduce((t, i) => t + i.tokens, 0),
      };
    });
    if (data.rodada) return { rodadas, conversas: conversas.sort((a, b) => a.posicao - b.posicao) };
    return { rodadas: rodadas.slice(0, 20), conversas: [] as typeof conversas };
  });

/** Conversa completa de um lead do ambiente (para a revisão na tela). */
export const conversaAmbiente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await exigirAcesso(context, data.clinicaId);
    const srv = await import("@/lib/nina/ambiente-testes.server");
    return { linhas: await srv.transcricaoParaJuiz(admin, data.clinicaId, data.conversaId) };
  });
