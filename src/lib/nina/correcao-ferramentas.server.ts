/**
 * Ferramentas reais do executor técnico.
 *
 * Cada função abaixo é uma ação de verdade no sistema, não uma sugestão: ler e
 * gravar o catálogo publicado, ler e publicar o prompt da Arquitetura, rodar o
 * turno de teste em homologação e registrar pendência quando a camada vive em
 * código.
 *
 * Garantias:
 *  - toda escrita confere de novo a permissão real do usuário que autorizou;
 *  - tudo é restrito ao `clinica_id` do erro reportado;
 *  - o bloco de identidade do atendimento nunca é alterado;
 *  - o teste roda em lead sintético pelo canal de teste, nunca no WhatsApp.
 */
import { identidadePreservada, type ResultadoTeste } from "./correcao-executor";

type Sb = any;

async function exigirAdminCatalogo(supabase: Sb, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica.");
  if (!["admin", "gestor"].includes(String(data.role)))
    throw new Error("Apenas administradores e gestores podem alterar o catálogo da Nina.");
}

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
/* Catálogo publicado                                                  */
/* ------------------------------------------------------------------ */

export type ItemCatalogo = {
  id: string;
  nome: string;
  valor: string | null;
  valor_observacao: string | null;
  descricao_publica: string | null;
  preparo: string | null;
  status: string;
};

/** Busca itens do catálogo desta clínica por trecho do nome. */
export async function lerCatalogo(
  supabase: Sb,
  clinicaId: string,
  termo: string,
): Promise<ItemCatalogo[]> {
  const busca = termo.trim().slice(0, 120);
  let q = supabase
    .from("nina_cat_servicos")
    .select("id, nome, valor, valor_observacao, descricao_publica, preparo, status")
    .eq("clinica_id", clinicaId)
    .order("nome")
    .limit(20);
  if (busca) q = q.ilike("nome", `%${busca}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ItemCatalogo[];
}

/**
 * Grava e publica o campo corrigido de um item do catálogo.
 * Só campos de conteúdo público — nunca status, vínculo ou identificador.
 */
export async function gravarItemCatalogo(
  supabase: Sb,
  userId: string,
  clinicaId: string,
  entrada: {
    itemId: string;
    campo: "valor" | "valor_observacao" | "descricao_publica" | "preparo";
    valorNovo: string;
  },
): Promise<{ anterior: string | null; publicado: boolean; nome: string }> {
  await exigirAdminCatalogo(supabase, userId, clinicaId);
  const { data: atual, error } = await supabase
    .from("nina_cat_servicos")
    .select("id, nome, valor, valor_observacao, descricao_publica, preparo")
    .eq("id", entrada.itemId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!atual) throw new Error("Item do catálogo não encontrado nesta clínica.");

  const anterior = (atual as Record<string, unknown>)[entrada.campo];
  const { error: erroUpd } = await supabase
    .from("nina_cat_servicos")
    .update({
      [entrada.campo]: entrada.valorNovo,
      status: "PUBLICADO",
      rascunho: null,
      publicado_em: new Date().toISOString(),
      publicado_por: userId,
    })
    .eq("id", entrada.itemId)
    .eq("clinica_id", clinicaId);
  if (erroUpd) throw new Error(erroUpd.message);

  return {
    anterior: anterior == null ? null : String(anterior),
    publicado: true,
    nome: String((atual as { nome?: string }).nome ?? ""),
  };
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

  const { resetarLeadTeste, processarMensagemTeste } = await import("./teste-console.server");
  await resetarLeadTeste(clinicaId, leadId, userId);

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
