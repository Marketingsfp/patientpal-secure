/**
 * Ferramentas reais do executor técnico.
 *
 * Cada função abaixo é uma ação de verdade no sistema, não uma sugestão: ler e
 * publicar o prompt da Arquitetura, rodar o turno de teste em homologação e
 * registrar pendência quando a camada vive em código ou no cadastro do sistema.
 *
 * Garantias:
 *  - toda escrita confere de novo a permissão real do usuário que autorizou;
 *  - tudo é restrito ao `clinica_id` do erro reportado;
 *  - o bloco de identidade do atendimento nunca é alterado;
 *  - o teste roda em lead sintético pelo canal de teste, nunca no WhatsApp.
 */
import { identidadePreservada, type ResultadoTeste } from "./correcao-executor";

type Sb = any;

async function exigirPublicarPrompt(supabase: Sb, userId: string, clinicaId: string) {
  const { capacidadesDoPapel } = await import("./arquitetura/permissoes");
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId);
  const pode = ((data ?? []) as Array<{ role: string }>).some((p) =>
    capacidadesDoPapel(String(p.role)).includes("nina.instrucoes.publicar"),
  );
  if (!pode) throw new Error("Você não tem permissão para publicar as Instruções da Nina.");
}

/* ------------------------------------------------------------------ */
/* Prompt da Arquitetura                                               */
/* ------------------------------------------------------------------ */

export async function lerPromptPublicado(
  supabase: Sb,
): Promise<{ id: string; versao: number; conteudo: string } | null> {
  const { data, error } = await supabase
    .from("nina_instrucoes_versoes")
    .select("id, versao, conteudo")
    .is("clinica_id", null)
    .eq("escopo", "whatsapp")
    .eq("status", "publicada")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as { id: string; versao: number; conteudo: string } | null;
}

/**
 * Publica uma nova versão do prompt da Arquitetura com o ajuste da correção.
 * Reprova antes de tocar na versão ativa quando o bloco de identidade muda ou
 * o template fica inválido.
 */
export async function publicarPrompt(
  supabase: Sb,
  userId: string,
  clinicaId: string,
  entrada: { conteudo: string; comentario: string },
): Promise<{ versao: number; anterior: number | null }> {
  await exigirPublicarPrompt(supabase, userId, clinicaId);

  const atual = await lerPromptPublicado(supabase);
  if (!atual) throw new Error("Não há versão publicada da Arquitetura para corrigir.");
  if (!identidadePreservada(atual.conteudo, entrada.conteudo))
    throw new Error(
      "A correção tentou alterar a identidade do atendimento. Publicação recusada.",
    );

  const { validarTemplateInstrucoes } = await import("./instrucoes-template");
  const template = validarTemplateInstrucoes("whatsapp", entrada.conteudo);
  if (!template.ok) throw new Error(template.mensagem);

  const { validarIdentidadeParaPublicacao } = await import("./identidade-atendimento");
  const identidade = validarIdentidadeParaPublicacao(entrada.conteudo);
  if (!identidade.ok) throw new Error(identidade.mensagem);

  const { data: nova, error } = await supabase.rpc("nina_instrucoes_publicar", {
    p_escopo: "whatsapp",
    p_conteudo: entrada.conteudo,
    p_comentario: entrada.comentario.slice(0, 500),
  });
  if (error) throw new Error(error.message);

  const { invalidarCacheInstrucoes } = await import("./instrucoes-runtime.server");
  invalidarCacheInstrucoes("whatsapp");

  return {
    versao: Number((nova as { versao?: number } | null)?.versao ?? 0),
    anterior: atual.versao,
  };
}

/* ------------------------------------------------------------------ */
/* Teste em homologação                                                */
/* ------------------------------------------------------------------ */

/**
 * Reexecuta a pergunta original em um lead sintético pelo canal de teste.
 * Nunca toca WhatsApp real, paciente real, agenda ou dado clínico.
 */
export async function testarEmHomologacao(
  clinicaId: string,
  userId: string,
  entrada: { pergunta: string; respostaErrada: string; valorNovo: string },
): Promise<ResultadoTeste> {
  const pergunta = entrada.pergunta.trim();
  if (!pergunta) {
    return {
      executado: false,
      aprovado: false,
      pergunta: null,
      resposta: null,
      motivo: "Sem a pergunta original vinculada ao erro: não é possível reproduzir o caso.",
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: leads, error } = await supabaseAdmin
    .from("nina_teste_leads")
    .select("id")
    .eq("clinica_id", clinicaId)
    .limit(1);
  if (error) throw new Error(error.message);
  const leadId = ((leads ?? []) as Array<{ id: string }>)[0]?.id;
  if (!leadId) {
    return {
      executado: false,
      aprovado: false,
      pergunta,
      resposta: null,
      motivo: "Nenhum lead sintético de homologação disponível nesta clínica.",
    };
  }

  // REGRA DA HOMOLOGAÇÃO — o reteste não reinicia lead nenhum. Se a sessão
  // estiver em andamento, sinaliza e aguarda o clique do operador no botão
  // "Resolver / Reiniciar teste".
  const { carregarLead, processarMensagemTeste } = await import("./teste-console.server");
  const leadAtual = await carregarLead(supabaseAdmin, clinicaId, leadId);
  if (leadAtual.conversa_id || leadAtual.ciclo_id) {
    return {
      executado: false,
      aprovado: false,
      pergunta,
      resposta: null,
      motivo:
        'Sessão de homologação em andamento neste lead. Use "Resolver / Reiniciar teste" e execute o reteste novamente.',
    };
  }


  const r = await processarMensagemTeste(
    {
      clinicaId,
      leadId,
      tipo: "text",
      texto: pergunta.slice(0, 1000),
      chave: `correcao-${Date.now()}`,
    },
    userId,
  );

  const { avaliarTeste } = await import("./correcao-executor");
  const veredito = avaliarTeste({
    respostaNova: r.reply ?? null,
    respostaErrada: entrada.respostaErrada,
    valorNovo: entrada.valorNovo,
  });

  return {
    executado: true,
    aprovado: veredito.aprovado,
    pergunta,
    resposta: r.reply ?? null,
    motivo: veredito.motivo,
  };
}
