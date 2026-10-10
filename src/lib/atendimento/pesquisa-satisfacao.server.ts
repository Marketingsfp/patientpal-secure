import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { loadWhatsAppConfig, metaSendText } from "@/lib/whatsapp.server";
import {
  classificarMensagemAposPesquisa,
  MENSAGEM_AGRADECIMENTO_AVALIACAO,
  MENSAGEM_PESQUISA_SATISFACAO,
  PRAZO_RESPOSTA_PESQUISA_MS,
} from "./pesquisa-satisfacao";

type Db = Pick<SupabaseClient<Database>, "from">;

type SolicitarArgs = {
  db: Db;
  clinicaId: string;
  conversaId: string;
  atendenteUserId: string | null;
  solicitadaPorUserId: string;
};

export async function solicitarPesquisaSatisfacao(args: SolicitarArgs) {
  if (!args.atendenteUserId)
    return { enviada: false, motivo: "Conversa encerrada sem atendente responsável." } as const;

  const { data: conversa, error: erroConversa } = await args.db
    .from("atend_conversas")
    .select("contato_telefone, is_teste")
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();
  if (erroConversa || !conversa?.contato_telefone)
    return { enviada: false, motivo: "Conversa sem telefone para enviar a pesquisa." } as const;
  if (conversa.is_teste)
    return { enviada: false, motivo: "Pesquisa não enviada em conversa de teste." } as const;

  await args.db
    .from("atend_avaliacoes")
    .update({ status: "expirada" })
    .eq("conversa_id", args.conversaId)
    .eq("status", "pendente");

  const { data: pesquisa, error: erroPesquisa } = await args.db
    .from("atend_avaliacoes")
    .insert({
      clinica_id: args.clinicaId,
      conversa_id: args.conversaId,
      atendente_user_id: args.atendenteUserId,
      solicitada_por_user_id: args.solicitadaPorUserId,
      nota: null,
      status: "pendente",
    })
    .select("id")
    .single();
  if (erroPesquisa || !pesquisa)
    return {
      enviada: false,
      motivo: erroPesquisa?.message ?? "Falha ao criar pesquisa de satisfação.",
    } as const;

  try {
    const cfg = await loadWhatsAppConfig(args.clinicaId);
    if (!cfg?.phone_number_id || !cfg?.access_token) throw new Error("WhatsApp não configurado");
    const to = conversa.contato_telefone.startsWith("+")
      ? conversa.contato_telefone
      : `+${conversa.contato_telefone}`;
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      to,
      MENSAGEM_PESQUISA_SATISFACAO,
    );
    // A Meta já aceitou o envio: mantenha a pesquisa pendente mesmo se o
    // espelho local da mensagem falhar, para a resposta ainda ser coletada.
    await args.db
      .from("atend_avaliacoes")
      .update({ solicitacao_wa_message_id: wa_message_id })
      .eq("id", pesquisa.id);
    const { error: erroMensagem } = await args.db.from("whatsapp_mensagens").insert({
      clinica_id: args.clinicaId,
      conversa_id: args.conversaId,
      wa_message_id,
      direction: "out",
      from_number: cfg.display_phone_number,
      to_number: to,
      body: MENSAGEM_PESQUISA_SATISFACAO,
      tipo: "text",
      status: "sent",
      enviada_por: "sistema",
      tratada_internamente: true,
    });
    if (erroMensagem)
      console.error("[pesquisa-satisfacao] mensagem enviada, mas não espelhada", erroMensagem);
    return { enviada: true } as const;
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "Falha desconhecida no WhatsApp";
    await args.db
      .from("atend_avaliacoes")
      .update({ status: "falha_envio", falha_envio: motivo.slice(0, 500) })
      .eq("id", pesquisa.id);
    return { enviada: false, motivo } as const;
  }
}

type ProcessarArgs = {
  db: Db;
  clinicaId: string;
  conversaId: string | null;
  texto: unknown;
  mensagemId: string;
  waMessageId: string;
};

export async function processarRespostaPesquisaSatisfacao(args: ProcessarArgs) {
  const classificacao = classificarMensagemAposPesquisa(args.texto);
  if (!args.conversaId) return { tratada: false } as const;

  if (classificacao.destino === "atendimento") {
    // Ao iniciar outro assunto, encerra a janela da pesquisa anterior. Assim,
    // números enviados no novo atendimento não podem virar uma nota antiga.
    const { error } = await args.db
      .from("atend_avaliacoes")
      .update({ status: "expirada" })
      .eq("clinica_id", args.clinicaId)
      .eq("conversa_id", args.conversaId)
      .eq("status", "pendente");
    if (error) console.error("[pesquisa-satisfacao] falha ao expirar pesquisa", error);
    return { tratada: false } as const;
  }
  const nota = classificacao.nota;

  const limite = new Date(Date.now() - PRAZO_RESPOSTA_PESQUISA_MS).toISOString();
  const { data: pendente, error } = await args.db
    .from("atend_avaliacoes")
    .select("id")
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId)
    .eq("status", "pendente")
    .gte("solicitada_em", limite)
    .order("solicitada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pendente) return { tratada: false } as const;

  const { data: atualizada, error: erroAtualizar } = await args.db
    .from("atend_avaliacoes")
    .update({
      nota,
      status: "respondida",
      respondida_em: new Date().toISOString(),
      resposta_wa_message_id: args.waMessageId,
    })
    .eq("id", pendente.id)
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  if (erroAtualizar) throw new Error(erroAtualizar.message);
  if (!atualizada) return { tratada: true, respostaDuplicada: true } as const;

  await args.db
    .from("whatsapp_mensagens")
    .update({ tratada_internamente: true, nina_status: "completed" })
    .eq("id", args.mensagemId)
    .eq("clinica_id", args.clinicaId);

  return { tratada: true, nota, resposta: MENSAGEM_AGRADECIMENTO_AVALIACAO } as const;
}
