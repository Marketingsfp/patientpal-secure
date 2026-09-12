/**
 * "Aplicar correção" — executor técnico assistido por GPT-5.6 Sol.
 *
 * O clique já é a autorização: esta função executa a proposta que estava na
 * tela, no escopo e ambiente apresentados. Não há segunda cadeia de
 * confirmação para a mesma proposta.
 *
 * O modelo aqui tem ferramentas REAIS (catálogo, prompt da Arquitetura, teste
 * em homologação), todas restritas à camada da proposta e à clínica do erro.
 * Camadas que vivem em código não são aplicadas: viram pendência técnica
 * rastreável com a mudança escrita.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { garantirProposta, normalizarProposta, type PropostaCorrecao } from "./analise-erro";
import {
  assinaturaProposta,
  avaliarProntidao,
  type EtapaExecucao,
} from "./correcao-prontidao";
import {
  INSTRUCOES_EXECUTOR,
  LIMITE_RODADAS_EXECUTOR,
  MODELO_EXECUTOR,
  ferramentasPermitidas,
  montarPromptExecutor,
  podeAplicarAutomaticamente,
  type PassoExecucao,
  type ResultadoTeste,
  type ResumoExecucao,
} from "./correcao-executor";
import type { PacoteInvestigacao } from "./evidencias-pacote";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

async function exigirPermissao(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase.rpc("nina_fb_pode_revisar", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão para aplicar correções desta clínica.");
}

/* ------------------------------------------------------------------ */
/* Definição das ferramentas expostas ao modelo                        */
/* ------------------------------------------------------------------ */

function definicoesFerramentas(camada: PropostaCorrecao["camada"]) {
  const obj = (props: Record<string, unknown>, req: string[]) => ({
    type: "object",
    additionalProperties: false,
    required: req,
    properties: props,
  });

  const todas: Record<string, any> = {
    ler_catalogo: {
      type: "function",
      name: "ler_catalogo",
      description: "Lista itens do catálogo publicado desta clínica por trecho do nome.",
      strict: true,
      parameters: obj({ termo: { type: "string" } }, ["termo"]),
    },
    gravar_item_catalogo: {
      type: "function",
      name: "gravar_item_catalogo",
      description: "Corrige e publica um campo público de um item do catálogo.",
      strict: true,
      parameters: obj(
        {
          item_id: { type: "string" },
          campo: {
            type: "string",
            enum: ["valor", "valor_observacao", "descricao_publica", "preparo"],
          },
          valor_novo: { type: "string" },
        },
        ["item_id", "campo", "valor_novo"],
      ),
    },
    ler_prompt_publicado: {
      type: "function",
      name: "ler_prompt_publicado",
      description: "Devolve a versão publicada do prompt da Arquitetura (escopo WhatsApp).",
      strict: true,
      parameters: obj({}, []),
    },
    publicar_prompt: {
      type: "function",
      name: "publicar_prompt",
      description:
        "Publica uma nova versão do prompt da Arquitetura com o ajuste. O bloco de identidade deve permanecer idêntico.",
      strict: true,
      parameters: obj({ conteudo: { type: "string" }, comentario: { type: "string" } }, [
        "conteudo",
        "comentario",
      ]),
    },
    testar_em_homologacao: {
      type: "function",
      name: "testar_em_homologacao",
      description:
        "Reexecuta a pergunta original em lead sintético de homologação e informa se a correção se comprovou.",
      strict: true,
      parameters: obj({ pergunta: { type: "string" } }, ["pergunta"]),
    },
    registrar_pendencia_tecnica: {
      type: "function",
      name: "registrar_pendencia_tecnica",
      description:
        "Registra a mudança proposta para quem tem acesso ao código, quando a camada não é configuração viva.",
      strict: true,
      parameters: obj({ instrucao: { type: "string" } }, ["instrucao"]),
    },
  };

  return ferramentasPermitidas(camada).map((f) => todas[f]);
}

/* ------------------------------------------------------------------ */
/* Chamada ao modelo (Responses API, streaming consumido no servidor)  */
/* ------------------------------------------------------------------ */

type SaidaModelo = { itens: any[]; texto: string };

async function chamarExecutor(input: any[], ferramentas: any[]): Promise<SaidaModelo> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Correção indisponível: chave do provedor de IA não configurada.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODELO_EXECUTOR,
      instructions: INSTRUCOES_EXECUTOR,
      input,
      tools: ferramentas,
      stream: true,
      store: false,
    }),
  });

  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Créditos de IA esgotados para esta correção.");
    if (res.status === 429) throw new Error("Limite de uso do modelo atingido. Tente mais tarde.");
    if (res.status === 400 && /model/i.test(corpo))
      throw new Error(`Modelo ${MODELO_EXECUTOR} indisponível no provedor deste projeto.`);
    throw new Error(`Falha do provedor (${res.status}). Correção não executada.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let itens: any[] = [];
  let texto = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.startsWith("data:")) continue;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === "[DONE]") continue;
      let ev: any;
      try {
        ev = JSON.parse(bruto);
      } catch {
        continue;
      }
      if (ev?.type === "response.output_text.delta" && typeof ev.delta === "string") {
        texto += ev.delta;
      }
      if (ev?.type === "response.completed" && ev.response) {
        itens = Array.isArray(ev.response.output) ? ev.response.output : [];
        if (typeof ev.response.output_text === "string" && ev.response.output_text)
          texto = ev.response.output_text;
      }
      if (ev?.type === "error" || ev?.type === "response.failed")
        throw new Error(ev?.error?.message ?? "Falha do provedor durante a correção.");
    }
  }

  return { itens, texto };
}

/* ------------------------------------------------------------------ */
/* Server function                                                     */
/* ------------------------------------------------------------------ */

const Entrada = z.object({
  clinicaId: z.string().uuid(),
  feedbackId: z.string().uuid(),
  /** Análise cuja proposta o usuário viu na tela ao autorizar. */
  analiseId: z.string().uuid().nullable().optional(),
  /** Assinatura da proposta exibida — divergiu, nada é aplicado. */
  propostaAssinatura: z.string().min(1).nullable().optional(),
  pacoteHash: z.string().nullable().optional(),
});

/** Estado atual da aplicação de uma correção (para retomar após recarregar). */
export const execucaoCorrecaoAtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), feedbackId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: linha, error } = await supabase
      .from("nina_correcao_execucoes")
      .select(
        "id, etapa, status, passos, resumo, erro, autorizado_por, autorizado_em, analise_id, pacote_hash, proposta_assinatura, ambiente, escopo",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (linha ?? null) as null | {
      id: string;
      etapa: EtapaExecucao;
      status: "em_curso" | "concluida" | "falhou";
      passos: PassoExecucao[];
      resumo: ResumoExecucao | null;
      erro: string | null;
      autorizado_por: string;
      autorizado_em: string;
      analise_id: string | null;
      pacote_hash: string | null;
      proposta_assinatura: string;
      ambiente: string | null;
      escopo: string | null;
    };
  });

export const aplicarCorrecaoComIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Entrada.parse(i))
  .handler(async ({ data, context }): Promise<ResumoExecucao & { acaoId: string | null }> => {
    const supabase = context.supabase as any;
    const userId = context.userId;
    await exigirPermissao(supabase, userId, data.clinicaId);

    const { data: fb, error: eFb } = await supabase
      .from("nina_feedback_erros")
      .select("id, clinica_id, mensagem_texto, pergunta_texto, root_cause, reportado_por, revisado_por")
      .eq("id", data.feedbackId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (eFb) throw new Error(eFb.message);
    if (!fb) throw new Error("Erro reportado não encontrado nesta clínica.");

    // A análise usada é a que estava na tela; sem id, a mais recente concluída.
    let consulta = supabase
      .from("nina_feedback_analises")
      .select("id, status, resultado, conclusao, pacote, pacote_hash, pacote_revisao")
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId);
    consulta = data.analiseId
      ? consulta.eq("id", data.analiseId)
      : consulta.eq("status", "done").order("versao", { ascending: false }).limit(1);
    const { data: analise, error: eAn } = await consulta.maybeSingle();
    if (eAn) throw new Error(eAn.message);
    if (!analise)
      throw new Error("Analise o erro com IA antes de aplicar a correção: não há proposta na tela.");

    const resultado = (analise.resultado ?? {}) as Record<string, unknown>;
    const proposta =
      garantirProposta(resultado["proposta"]) ?? normalizarProposta(resultado["proposta"]);

    /**
     * FASE 2 — o mesmo gate da tela roda aqui: permissão, análise concluída,
     * proposta aplicável, executor disponível e proposta idêntica à exibida.
     */
    const { data: emCurso } = await supabase
      .from("nina_correcao_execucoes")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .eq("status", "em_curso")
      .maybeSingle();

    const prontidao = avaliarProntidao({
      statusAnalise: (analise.status as "processing" | "done" | "failed") ?? null,
      resultado: (analise.resultado as any) ?? null,
      proposta,
      temPermissao: true,
      executorDisponivel: Boolean(process.env["LOVABLE_API_KEY"]),
      execucaoEmCurso: Boolean(emCurso),
      assinaturaExibida: data.propostaAssinatura ?? null,
    });
    if (!prontidao.habilitado || !proposta) throw new Error(prontidao.motivo);

    if (data.pacoteHash && analise.pacote_hash && data.pacoteHash !== String(analise.pacote_hash))
      throw new Error(
        "As evidências desta análise mudaram desde o que foi exibido. Confira a proposta atualizada antes de aplicar.",
      );

    /**
     * FASE 1 — a correção usa o MESMO pacote que fundamentou a proposta.
     * Análises antigas (sem pacote persistido) são reconstruídas com as
     * evidências disponíveis e a revisão sobe; nada é reanalisado à força.
     */
    let pacote = (analise.pacote as PacoteInvestigacao | null) ?? null;
    if (!pacote) {
      const { montarPacoteInvestigacao } = await import("./evidencias-pacote.server");
      pacote = await montarPacoteInvestigacao(context.supabase, {
        clinicaId: data.clinicaId,
        feedbackId: data.feedbackId,
        analiseId: String(analise.id),
        origem: "enriquecido",
        revisaoAnterior: (analise.pacote_revisao as number | null) ?? 0,
      });
      await supabase
        .from("nina_feedback_analises")
        .update({
          pacote,
          pacote_hash: pacote.hash,
          pacote_revisao: pacote.revisao,
        })
        .eq("id", analise.id)
        .eq("clinica_id", data.clinicaId);
    }

    /**
     * Registro de autorização e progresso: quem clicou, quando, qual análise,
     * pacote, proposta, ambiente e alcance. Recarregar a tela retoma daqui.
     */
    const assinatura = assinaturaProposta(proposta);
    const { data: execLinha, error: eExec } = await supabase
      .from("nina_correcao_execucoes")
      .insert({
        clinica_id: data.clinicaId,
        feedback_id: data.feedbackId,
        analise_id: analise.id,
        pacote_hash: pacote.hash,
        pacote_revisao: pacote.revisao,
        proposta,
        proposta_assinatura: assinatura,
        ambiente: proposta.ambiente ?? pacote.identificacao.ambiente ?? null,
        escopo: proposta.escopo,
        autorizado_por: userId,
        etapa: "verificando",
        status: "em_curso",
        passos: [],
      })
      .select("id")
      .single();
    if (eExec) throw new Error("Já existe uma aplicação em andamento para este erro.");
    const execucaoId = execLinha?.id as string;

    const passos: PassoExecucao[] = [];
    const atualizarEtapa = async (etapa: EtapaExecucao) => {
      await supabase
        .from("nina_correcao_execucoes")
        .update({ etapa, passos })
        .eq("id", execucaoId)
        .eq("clinica_id", data.clinicaId);
    };
    const passo = (
      ferramenta: PassoExecucao["ferramenta"],
      titulo: string,
      detalhe: string,
      ok = true,
    ) => {
      passos.push({
        ordem: passos.length + 1,
        ferramenta,
        titulo,
        detalhe: detalhe.slice(0, 2000),
        ok,
        em: new Date().toISOString(),
      });
    };


    let teste: ResultadoTeste = {
      executado: false,
      aprovado: false,
      pergunta: (fb.pergunta_texto as string | null) ?? null,
      resposta: null,
      motivo: "Teste ainda não executado.",
    };
    let publicado = false;
    let valorAnterior: string | null = proposta.valorAtual;
    let pendenciaTecnica: string | null = null;
    let motivoFinal = "";

    const aplicavel = podeAplicarAutomaticamente(proposta);
    passo(
      "sistema",
      "Proposta autorizada",
      `${proposta.alvo} — camada ${proposta.camada}. ${
        aplicavel
          ? "Camada é configuração viva: o executor altera e publica."
          : "Camada vive em código: o executor registra a mudança para quem publica código."
      }`,
    );
    await atualizarEtapa("aplicando");


    const ferramentas = definicoesFerramentas(proposta.camada);
    const entradaModelo: any[] = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: montarPromptExecutor({
              proposta,
              diagnostico: String(analise.conclusao ?? ""),
              perguntaOriginal: (fb.pergunta_texto as string | null) ?? null,
              respostaErrada: String(fb.mensagem_texto ?? ""),
              evidencias: {
                hash: pacote.hash,
                revisao: pacote.revisao,
                origem: pacote.origem,
                ambiente: pacote.identificacao.ambiente,
                entradas: pacote.entradas.map((m) => ({
                  id: m.id,
                  em: m.em,
                  texto: m.texto,
                  ausente: m.ausente,
                })),
                prompt: pacote.prompt,
                lacunas: pacote.lacunas,
                cortes: pacote.cortes,
              },
            }),
          },
        ],
      },
    ];

    const ferramentasServer = await import("./correcao-ferramentas.server");

    try {
      for (let rodada = 0; rodada < LIMITE_RODADAS_EXECUTOR; rodada++) {
        const saida = await chamarExecutor(entradaModelo, ferramentas);
        const chamadas = saida.itens.filter((i: any) => i?.type === "function_call");
        entradaModelo.push(...saida.itens);

        if (!chamadas.length) {
          motivoFinal = saida.texto.trim().slice(0, 2000) || "Execução concluída.";
          break;
        }

        for (const c of chamadas) {
          let args: any = {};
          try {
            args = JSON.parse(c.arguments ?? "{}");
          } catch {
            args = {};
          }
          let retorno: unknown;
          try {
            if (c.name === "ler_catalogo") {
              retorno = await ferramentasServer.lerCatalogo(
                supabase,
                data.clinicaId,
                String(args.termo ?? ""),
              );
              passo("ler_catalogo", "Catálogo consultado", `Termo: ${args.termo ?? ""}`);
            } else if (c.name === "gravar_item_catalogo") {
              const r = await ferramentasServer.gravarItemCatalogo(supabase, userId, data.clinicaId, {
                itemId: String(args.item_id),
                campo: args.campo,
                valorNovo: String(args.valor_novo ?? ""),
              });
              valorAnterior = r.anterior;
              publicado = true;
              retorno = r;
              passo(
                "gravar_item_catalogo",
                "Catálogo corrigido e publicado",
                `${r.nome} · ${args.campo}: "${r.anterior ?? "—"}" → "${args.valor_novo}"`,
              );
            } else if (c.name === "ler_prompt_publicado") {
              retorno = await ferramentasServer.lerPromptPublicado(supabase);
              passo("ler_prompt_publicado", "Prompt publicado lido", "Versão ativa da Arquitetura.");
            } else if (c.name === "publicar_prompt") {
              const anterior = await ferramentasServer.lerPromptPublicado(supabase);
              valorAnterior = anterior?.conteudo ?? null;
              const r = await ferramentasServer.publicarPrompt(supabase, userId, data.clinicaId, {
                conteudo: String(args.conteudo ?? ""),
                comentario: String(args.comentario ?? "Correção assistida de erro reportado"),
              });
              publicado = true;
              retorno = r;
              passo(
                "publicar_prompt",
                "Arquitetura publicada",
                `Versão ${r.anterior ?? "—"} → ${r.versao}. Identidade preservada.`,
              );
            } else if (c.name === "testar_em_homologacao") {
              teste = await ferramentasServer.testarEmHomologacao(data.clinicaId, userId, {
                pergunta: String(args.pergunta ?? fb.pergunta_texto ?? ""),
                respostaErrada: String(fb.mensagem_texto ?? ""),
                valorNovo: proposta.valorNovo,
              });
              retorno = teste;
              passo(
                "testar_em_homologacao",
                teste.aprovado ? "Teste aprovado" : "Teste não comprovou",
                teste.motivo,
                teste.aprovado,
              );
            } else if (c.name === "registrar_pendencia_tecnica") {
              pendenciaTecnica = String(args.instrucao ?? "").slice(0, 4000);
              retorno = { registrado: true };
              passo("registrar_pendencia_tecnica", "Pendência técnica registrada", pendenciaTecnica);
            } else {
              retorno = { erro: "Ferramenta não liberada para esta camada." };
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Falha na ferramenta.";
            retorno = { erro: msg };
            passo(
              (c.name as PassoExecucao["ferramenta"]) ?? "sistema",
              "Ferramenta recusada",
              msg,
              false,
            );
          }

          entradaModelo.push({
            type: "function_call_output",
            call_id: c.call_id,
            output: JSON.stringify(retorno).slice(0, 12000),
          });
        }
      }
    } catch (e) {
      motivoFinal = e instanceof Error ? e.message : "Falha desconhecida na correção.";
      passo("sistema", "Execução interrompida", motivoFinal, false);
    }

    const status: ResumoExecucao["status"] = !aplicavel
      ? "pendente_tecnico"
      : publicado && teste.aprovado
        ? "aplicado"
        : "falhou";

    if (!motivoFinal) motivoFinal = teste.motivo;

    // Registro rastreável — mesmas tabelas do fluxo existente.
    const agora = new Date().toISOString();
    const { data: acao } = await supabase
      .from("nina_feedback_acoes")
      .insert({
        clinica_id: data.clinicaId,
        feedback_id: data.feedbackId,
        root_cause: (fb.root_cause as string | null) ?? proposta.camada,
        camada: proposta.camada === "modelo" ? "modelo" : proposta.camada,
        tipo: proposta.camada === "catalogo" ? "kb_update" : "reasoning_fix",
        titulo: proposta.alvo.slice(0, 300),
        instrucao: pendenciaTecnica ?? proposta.justificativa,
        valor_atual: valorAnterior,
        valor_novo: proposta.valorNovo,
        status: status === "aplicado" ? "done" : "open",
        evidencia: { proposta, teste, publicado, executor: MODELO_EXECUTOR },
        execucao: {
          status,
          passos,
          teste,
          motivo: motivoFinal,
          modelo: MODELO_EXECUTOR,
          // Origem verificável do que fundamentou a correção.
          pacote_hash: pacote.hash,
          pacote_revisao: pacote.revisao,
          analise_id: String(analise.id),
        },
        criado_por: userId,
        concluido_por: status === "aplicado" ? userId : null,
        concluido_em: status === "aplicado" ? agora : null,
        homologado: teste.aprovado,
      })
      .select("id")
      .single();

    const { count } = await supabase
      .from("nina_feedback_versoes")
      .select("id", { count: "exact", head: true })
      .eq("feedback_id", data.feedbackId);

    await supabase.from("nina_feedback_versoes").insert({
      clinica_id: data.clinicaId,
      feedback_id: data.feedbackId,
      acao_id: acao?.id ?? null,
      versao: (count ?? 0) + 1,
      item: proposta.alvo.slice(0, 500),
      valor_anterior: valorAnterior,
      valor_novo: proposta.valorNovo,
      motivo: proposta.justificativa.slice(0, 2000) || motivoFinal,
      camada: proposta.camada,
      tipo: proposta.camada === "catalogo" ? "kb_update" : "reasoning_fix",
      root_cause: (fb.root_cause as string | null) ?? proposta.camada,
      reportado_por: (fb.reportado_por as string | null) ?? null,
      aprovado_por: (fb.revisado_por as string | null) ?? null,
      aplicado_por: userId,
      evidencia: { teste, passos, publicado },
      teste_status: teste.aprovado ? "aprovado" : teste.executado ? "reprovado" : "pendente",
    });

    if (status === "aplicado") {
      await supabase
        .from("nina_feedback_erros")
        .update({
          status: "applied",
          aplicacao_tipo: proposta.camada === "catalogo" ? "kb_update" : "reasoning_fix",
          aplicacao_resumo: proposta.alvo.slice(0, 300),
          aplicacao_evidencia: { proposta, teste, passos },
          aplicado_por: userId,
          aplicado_em: agora,
        })
        .eq("id", data.feedbackId)
        .eq("clinica_id", data.clinicaId);
    }

    return {
      status,
      camada: proposta.camada,
      passos,
      teste,
      publicado,
      valorAnterior,
      valorNovo: proposta.valorNovo,
      motivo: motivoFinal,
      acaoId: (acao?.id as string | undefined) ?? null,
    };
  });
