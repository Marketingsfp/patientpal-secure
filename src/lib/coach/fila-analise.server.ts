/**
 * Fila persistida de transcrição + análise de ligações (tel_fila_analise).
 * Escrita só via service role, sempre filtrada por clinica_id.
 * Logs só com error.code — nunca telefone, token ou texto.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ClienteCoach } from "./guard.server";
import {
  ORCAMENTO_RODADA_MS,
  MIN_CARACTERES,
  MAX_TENTATIVAS,
  codigoDoErro,
  estadoAposTranscricao,
  prazoTranscricao,
  type EstadoFila,
} from "./fila-analise";

/** Mesma regra de coach_registrar_uso_ia: data de São Paulo à meia-noite UTC. */
export async function calcularCotaIA(clinicaId: string, userId: string) {
  const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const desde = `${dia}T00:00:00Z`;
  const [cfg, eu, clinica] = await Promise.all([
    supabaseAdmin
      .from("coach_config_clinica")
      .select("limite_ia_usuario, limite_ia_clinica")
      .eq("clinica_id", clinicaId)
      .maybeSingle(),
    supabaseAdmin
      .from("coach_uso_ia")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .eq("user_id", userId)
      .gte("created_at", desde),
    supabaseAdmin
      .from("coach_uso_ia")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .gte("created_at", desde),
  ]);
  const limUser = Number(cfg.data?.limite_ia_usuario ?? 60) || 60;
  const limClin = Number(cfg.data?.limite_ia_clinica ?? 600) || 600;
  return {
    restaUsuario: Math.max(0, limUser - (eu.count ?? 0)),
    limiteUsuario: limUser,
    restaClinica: Math.max(0, limClin - (clinica.count ?? 0)),
    limiteClinica: limClin,
  };
}

/**
 * Analisa a transcrição guardada e grava em tel_analises — o mesmo caminho do
 * botão "Analisar" (analisarLigacao usa esta função).
 */
export async function analisarTranscricaoGuardada(
  db: ClienteCoach,
  clinicaId: string,
  externoId: string,
  userId: string,
) {
  const { analisarTextoNoServidor } = await import("./analyze.functions");
  const { data: t } = await supabaseAdmin
    .from("tel_transcricoes")
    .select("texto")
    .eq("clinica_id", clinicaId)
    .eq("origem", "sufficit")
    .eq("externo_id", externoId)
    .maybeSingle();
  if (!t?.texto || t.texto.trim().length < MIN_CARACTERES) {
    throw new Error("Busque a transcrição desta ligação antes de analisar.");
  }
  const resultado = await analisarTextoNoServidor(db, {
    clinicaId,
    text: t.texto.slice(0, 30_000),
    semFalantes: true,
  });
  const { error } = await supabaseAdmin.from("tel_analises").insert({
    clinica_id: clinicaId,
    origem: "sufficit",
    externo_id: externoId,
    resultado: resultado as never,
    pontuacao: Number(resultado.pontuacao) || null,
    criado_por: userId,
  });
  if (error) console.error("[coach] gravar análise da ligação:", error.code ?? "erro");
  return { resultado, gravou: !error };
}

async function idsExistentes(tabela: "tel_analises" | "tel_transcricoes", clinicaId: string, ids: string[]) {
  const achados = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin
      .from(tabela)
      .select("externo_id")
      .eq("clinica_id", clinicaId)
      .eq("origem", "sufficit")
      .in("externo_id", ids.slice(i, i + 150));
    if (error) throw new Error("Não foi possível conferir o que já foi feito.");
    for (const r of data ?? []) achados.add(r.externo_id);
  }
  return achados;
}

export async function enfileirar(
  clinicaId: string,
  p: { start: string; end: string; incluirFeitas: boolean },
) {
  const direcoes = p.incluirFeitas ? ["INCOMING", "OUTBOUND"] : ["INCOMING"];
  const ids: string[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin
      .from("tel_chamadas")
      .select("externo_id, direcao, situacao")
      .eq("clinica_id", clinicaId)
      .eq("origem", "sufficit")
      .gte("inicio", p.start)
      .lte("inicio", p.end)
      .order("inicio", { ascending: true })
      .range(de, de + 999);
    if (error) throw new Error("Não foi possível ler as ligações do período.");
    for (const l of data ?? []) {
      if ((l.situacao ?? "").toUpperCase() !== "ANSWERED") continue;
      if (!direcoes.includes((l.direcao ?? "").toUpperCase())) continue;
      ids.push(l.externo_id);
    }
    if ((data ?? []).length < 1000) break;
  }
  const analisadas = await idsExistentes("tel_analises", clinicaId, ids);
  const transcritas = await idsExistentes("tel_transcricoes", clinicaId, ids);
  let enfileiradas = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const linhas = ids.slice(i, i + 500).map((id) => ({
      clinica_id: clinicaId,
      origem: "sufficit",
      externo_id: id,
      estado: (analisadas.has(id) ? "analisado" : transcritas.has(id) ? "transcrito" : "pendente") as EstadoFila,
    }));
    const { data, error } = await supabaseAdmin
      .from("tel_fila_analise")
      .upsert(linhas, { onConflict: "clinica_id,origem,externo_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[coach] enfileirar:", error.code ?? "erro");
      throw new Error("Não foi possível enfileirar as ligações.");
    }
    enfileiradas += data?.length ?? 0;
  }
  const { count } = await supabaseAdmin
    .from("tel_fila_analise")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", clinicaId);
  return {
    enfileiradas,
    jaAnalisadas: analisadas.size,
    jaTranscritas: [...transcritas].filter((id) => !analisadas.has(id)).length,
    totalNaFila: count ?? 0,
  };
}

export async function contagemPorEstado(clinicaId: string) {
  const estados: EstadoFila[] = ["pendente", "transcrito", "analisado", "sem_gravacao", "erro"];
  const r = await Promise.all(
    estados.map((e) =>
      supabaseAdmin
        .from("tel_fila_analise")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId)
        .eq("estado", e),
    ),
  );
  return Object.fromEntries(estados.map((e, i) => [e, r[i].count ?? 0])) as Record<EstadoFila, number>;
}

/** Item travado por outra aba há menos que isto não é pego de novo. */
const TRAVA_MS = 4 * 60_000;

export async function processarLote(
  db: ClienteCoach,
  clinicaId: string,
  userId: string,
  maximo: number,
) {
  const s = await import("./telefonia-sufficit.server");
  const inicio = Date.now();
  const out = {
    processados: 0,
    analisados: 0,
    semGravacao: 0,
    erros: 0,
    aindaPendentes: 0,
    cotaRestanteUsuario: 0,
    cotaRestanteClinica: 0,
    pausadoPorCota: false,
    aviso: null as string | null,
  };

  const corte = new Date(Date.now() - TRAVA_MS).toISOString();
  const { data: candidatos, error } = await supabaseAdmin
    .from("tel_fila_analise")
    .select("id, externo_id, estado, tentativas")
    .eq("clinica_id", clinicaId)
    .in("estado", ["pendente", "transcrito"])
    .or(`tentativas.eq.0,atualizado_em.lt.${corte}`)
    .order("criado_em", { ascending: true })
    .order("id", { ascending: true })
    .limit(maximo * 3);
  if (error) {
    console.error("[coach] fila: ler", error.code ?? "erro");
    throw new Error("Não foi possível ler a fila.");
  }

  let feitos = 0;
  for (const item of candidatos ?? []) {
    if (feitos >= maximo) break;
    if (Date.now() - inicio > ORCAMENTO_RODADA_MS) break;
    const cota = await calcularCotaIA(clinicaId, userId);
    if (cota.restaUsuario <= 0 || cota.restaClinica <= 0) {
      out.pausadoPorCota = true;
      break;
    }

    // Trava otimista: só segue quem conseguir somar a tentativa primeiro.
    const tentativas = item.tentativas + 1;
    const { data: pego } = await supabaseAdmin
      .from("tel_fila_analise")
      .update({ tentativas, atualizado_em: new Date().toISOString() })
      .eq("id", item.id)
      .eq("clinica_id", clinicaId)
      .eq("tentativas", item.tentativas)
      .in("estado", ["pendente", "transcrito"])
      .select("id");
    if (!pego?.length) continue;
    feitos++;
    out.processados++;

    const gravar = async (estado: EstadoFila, ultimoErro: string | null) => {
      const { error: e } = await supabaseAdmin
        .from("tel_fila_analise")
        .update({ estado, ultimo_erro: ultimoErro, atualizado_em: new Date().toISOString() })
        .eq("id", item.id)
        .eq("clinica_id", clinicaId);
      if (e) console.error("[coach] fila: atualizar", e.code ?? "erro");
    };

    try {
      // Já analisada pelo clique depois de enfileirar: não gasta IA de novo.
      const jaAnalisada = await idsExistentes("tel_analises", clinicaId, [item.externo_id]);
      if (jaAnalisada.size) {
        await gravar("analisado", null);
        out.analisados++;
        continue;
      }

      const t = await s.buscarTranscricaoSufficit(
        clinicaId,
        item.externo_id,
        prazoTranscricao(Date.now() - inicio),
      );
      const prox = estadoAposTranscricao(t, tentativas);
      if (prox.estado !== "transcrito") {
        await gravar(prox.estado, prox.ultimoErro);
        if (prox.estado === "sem_gravacao") out.semGravacao++;
        if (prox.estado === "erro") out.erros++;
        continue;
      }
      await gravar("transcrito", null);

      try {
        const r = await analisarTranscricaoGuardada(db, clinicaId, item.externo_id, userId);
        if (!r.gravou) throw new Error("gravar análise");
        await gravar("analisado", null);
        out.analisados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/limite/i.test(msg)) {
          // Cota acabou no meio: volta a tentativa, fica transcrito.
          await supabaseAdmin
            .from("tel_fila_analise")
            .update({ tentativas: item.tentativas })
            .eq("id", item.id)
            .eq("clinica_id", clinicaId);
          out.pausadoPorCota = true;
          break;
        }
        const final = tentativas >= MAX_TENTATIVAS;
        await gravar(final ? "erro" : "transcrito", "IA: análise falhou");
        if (final) out.erros++;
        if (/indisponível/i.test(msg)) {
          out.aviso = "O recurso de IA está indisponível no momento. Avise a gestão da clínica.";
          break;
        }
      }
    } catch (e) {
      // Uma ligação nunca derruba a rodada.
      const msg = e instanceof Error ? e.message : "falha";
      console.error("[coach] fila: item falhou");
      const final = tentativas >= MAX_TENTATIVAS;
      await gravar(final ? "erro" : item.estado as EstadoFila, codigoDoErro(msg));
      if (final) out.erros++;
    }
  }

  const [cont, cota] = await Promise.all([contagemPorEstado(clinicaId), calcularCotaIA(clinicaId, userId)]);
  out.aindaPendentes = cont.pendente + cont.transcrito;
  out.cotaRestanteUsuario = cota.restaUsuario;
  out.cotaRestanteClinica = cota.restaClinica;
  if (cota.restaUsuario <= 0 || cota.restaClinica <= 0) {
    if (out.aindaPendentes > 0) out.pausadoPorCota = true;
  }
  return out;
}
