import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { loadWhatsAppConfig, metaSendList, metaSendText } from "@/lib/whatsapp.server";
import {
  classificarMensagemAposPesquisa,
  ESPELHO_PESQUISA_LISTA,
  MENSAGEM_AGRADECIMENTO_AVALIACAO,
  MENSAGEM_PESQUISA_SATISFACAO,
  PESQUISA_LISTA,
  PRAZO_RESPOSTA_PESQUISA_MS,
} from "./pesquisa-satisfacao";

type Db = Pick<SupabaseClient<Database>, "from">;

const TEMPO_MAXIMO_PESQUISA_MS = 10_000;

/**
 * Fila da pesquisa (17/10/2026): o Encerrar só registra a pesquisa; o envio
 * pela Meta sai na rotina de 1 minuto (`nina-watchdog-processamento`).
 * "Na fila" = `pendente` sem `solicitacao_wa_message_id`; durante o envio a
 * coluna guarda uma trava `enviando:<ms>:<id>` para ninguém enviar em dobro.
 */
export const TRAVA_ENVIO_PESQUISA = "enviando:";
/** Depois disso a pesquisa não é mais enviada (decisão do usuário: 2 horas). */
export const PRAZO_ENVIO_FILA_PESQUISA_MS = 2 * 60 * 60 * 1000;
/** Trava mais velha que isso = envio interrompido; não reenvia para não duplicar. */
export const TRAVA_MAXIMA_PESQUISA_MS = 5 * 60 * 1000;
const LOTE_FILA_PESQUISA = 10;

type RegistrarArgs = {
  db: Db;
  clinicaId: string;
  conversaId: string;
  atendenteUserId: string | null;
  solicitadaPorUserId: string;
  /** Telefone e marca de teste já lidos pelo encerramento (17/10/2026): não relê a conversa. */
  conversa?: { contato_telefone: string | null; is_teste: boolean | null };
};

/** Encerrar: deixa a pesquisa na fila, sem esperar a Meta. */
export async function registrarPesquisaNaFila(args: RegistrarArgs) {
  if (!args.atendenteUserId)
    return { registrada: false, motivo: "Conversa encerrada sem atendente responsável." } as const;

  const { data: conversa, error: erroConversa } = args.conversa
    ? { data: args.conversa, error: null }
    : await args.db
        .from("atend_conversas")
        .select("contato_telefone, is_teste")
        .eq("id", args.conversaId)
        .eq("clinica_id", args.clinicaId)
        .maybeSingle();
  if (erroConversa || !conversa?.contato_telefone)
    return { registrada: false, motivo: "Conversa sem telefone para enviar a pesquisa." } as const;
  if (conversa.is_teste)
    return { registrada: false, motivo: "Pesquisa não enviada em conversa de teste." } as const;

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
      registrada: false,
      motivo: erroPesquisa?.message ?? "Falha ao criar pesquisa de satisfação.",
    } as const;
  return { registrada: true, pesquisaId: pesquisa.id } as const;
}

export type EnvioPesquisa = {
  wa_message_id: string;
  corpo: string;
  tipo: string;
  de: string | null;
};

/** Envia pela Meta: lista de toque com as 5 notas; se recusada, o texto com os números. */
export async function enviarPesquisaPelaMeta(clinicaId: string, telefone: string) {
  const cfg = await loadWhatsAppConfig(clinicaId);
  if (!cfg?.phone_number_id || !cfg?.access_token) throw new Error("WhatsApp não configurado");
  const to = telefone.startsWith("+") ? telefone : `+${telefone}`;
  const { phone_number_id: numeroId, access_token: token } = cfg;
  let corpo = ESPELHO_PESQUISA_LISTA;
  let tipo = "interactive";
  const limite = { timeoutMs: TEMPO_MAXIMO_PESQUISA_MS };
  const { wa_message_id } = await metaSendList(numeroId, token, to, PESQUISA_LISTA, limite).catch(
    (erroLista: unknown) => {
      // Sem resposta a tempo, a lista pode ter chegado: o texto de reserva
      // duplicaria a pesquisa. Vale como falha de envio.
      if ((erroLista as { name?: string } | null)?.name === "TimeoutError") throw erroLista;
      console.error(
        "[pesquisa-satisfacao] lista recusada, enviando texto",
        erroLista instanceof Error ? erroLista.message.slice(0, 200) : "erro",
      );
      corpo = MENSAGEM_PESQUISA_SATISFACAO;
      tipo = "text";
      return metaSendText(numeroId, token, to, MENSAGEM_PESQUISA_SATISFACAO, limite);
    },
  );
  return { wa_message_id, corpo, tipo, de: cfg.display_phone_number ?? null, to };
}

type FilaArgs = {
  db: Db;
  agora?: Date;
  /** Troca o envio real nos testes. */
  enviar?: (clinicaId: string, telefone: string) => Promise<EnvioPesquisa & { to?: string }>;
};

/** Carteiro da pesquisa: chamado a cada minuto pela rotina do servidor. */
export async function enviarPesquisasNaFila(args: FilaArgs) {
  const agora = args.agora ?? new Date();
  const enviar = args.enviar ?? enviarPesquisaPelaMeta;
  const r = { enviadas: 0, falhas: 0, expiradas: 0, atrasadas: 0, interrompidas: 0 };
  const falhar = (id: string, motivo: string) =>
    args.db
      .from("atend_avaliacoes")
      .update({
        status: "falha_envio",
        falha_envio: motivo.slice(0, 500),
        solicitacao_wa_message_id: null,
      })
      .eq("id", id)
      .eq("status", "pendente");

  // 1) Envio interrompido no meio (trava velha): falha, sem reenviar.
  const { data: travadas } = await args.db
    .from("atend_avaliacoes")
    .select("id, solicitacao_wa_message_id")
    .eq("status", "pendente")
    .like("solicitacao_wa_message_id", `${TRAVA_ENVIO_PESQUISA}%`)
    .limit(50);
  for (const t of travadas ?? []) {
    const desde = Number(String(t.solicitacao_wa_message_id).split(":")[1]);
    if (Number.isFinite(desde) && agora.getTime() - desde < TRAVA_MAXIMA_PESQUISA_MS) continue;
    await falhar(t.id, "Envio interrompido; não reenviada para não duplicar a pesquisa.");
    r.interrompidas++;
  }

  // 2) Na fila há mais de 2 horas: não envia mais.
  const limiteFila = new Date(agora.getTime() - PRAZO_ENVIO_FILA_PESQUISA_MS).toISOString();
  const { data: atrasadas } = await args.db
    .from("atend_avaliacoes")
    .update({
      status: "falha_envio",
      falha_envio: "Não enviada em até 2 horas após o encerramento.",
    })
    .eq("status", "pendente")
    .is("solicitacao_wa_message_id", null)
    .lt("solicitada_em", limiteFila)
    .select("id");
  r.atrasadas = atrasadas?.length ?? 0;

  // 3) Fila do momento, mais antigas primeiro.
  const { data: fila, error } = await args.db
    .from("atend_avaliacoes")
    .select("id, clinica_id, conversa_id")
    .eq("status", "pendente")
    .is("solicitacao_wa_message_id", null)
    .gte("solicitada_em", limiteFila)
    .order("solicitada_em", { ascending: true })
    .limit(LOTE_FILA_PESQUISA);
  if (error) throw new Error(error.message);
  if (!fila?.length) return r;

  const { data: conversas } = await args.db
    .from("atend_conversas")
    .select("id, status, contato_telefone, is_teste")
    .in(
      "id",
      fila.map((p) => p.conversa_id),
    );
  const porId = new Map((conversas ?? []).map((c) => [c.id, c]));

  for (const p of fila) {
    const conversa = porId.get(p.conversa_id);
    // Conversa reaberta (o paciente voltou a falar) ou sem destino: descarta.
    if (!conversa || (conversa.status !== "closed" && conversa.status !== "finished")) {
      await args.db
        .from("atend_avaliacoes")
        .update({ status: "expirada" })
        .eq("id", p.id)
        .eq("status", "pendente")
        .is("solicitacao_wa_message_id", null);
      r.expiradas++;
      continue;
    }
    if (!conversa.contato_telefone || conversa.is_teste) {
      await falhar(p.id, "Conversa sem telefone para enviar a pesquisa.");
      r.falhas++;
      continue;
    }
    // Trava: só quem marcar primeiro envia.
    const trava = `${TRAVA_ENVIO_PESQUISA}${agora.getTime()}:${crypto.randomUUID()}`;
    const { data: minha } = await args.db
      .from("atend_avaliacoes")
      .update({ solicitacao_wa_message_id: trava })
      .eq("id", p.id)
      .eq("status", "pendente")
      .is("solicitacao_wa_message_id", null)
      .select("id")
      .maybeSingle();
    if (!minha) continue;
    try {
      const envio = await enviar(p.clinica_id, conversa.contato_telefone);
      // A Meta já aceitou: a pesquisa vale 24 h a partir do envio.
      const [{ error: erroPesquisa }, { error: erroMensagem }] = await Promise.all([
        args.db
          .from("atend_avaliacoes")
          .update({
            solicitacao_wa_message_id: envio.wa_message_id,
            solicitada_em: new Date().toISOString(),
          })
          .eq("id", p.id),
        args.db.from("whatsapp_mensagens").insert({
          clinica_id: p.clinica_id,
          conversa_id: p.conversa_id,
          wa_message_id: envio.wa_message_id,
          direction: "out",
          from_number: envio.de,
          to_number: envio.to ?? conversa.contato_telefone,
          body: envio.corpo,
          tipo: envio.tipo,
          status: "sent",
          enviada_por: "sistema",
          tratada_internamente: true,
        }),
      ]);
      if (erroPesquisa)
        console.error("[pesquisa-satisfacao] enviada, mas sem registrar o envio", erroPesquisa);
      if (erroMensagem)
        console.error("[pesquisa-satisfacao] mensagem enviada, mas não espelhada", erroMensagem);
      r.enviadas++;
    } catch (erro) {
      await falhar(p.id, erro instanceof Error ? erro.message : "Falha desconhecida no WhatsApp");
      r.falhas++;
    }
  }
  return r;
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

  // Só vale nota de pesquisa que já saiu pela Meta (fila, 17/10/2026): um "5"
  // mandado antes do envio não vira avaliação.
  const limite = new Date(Date.now() - PRAZO_RESPOSTA_PESQUISA_MS).toISOString();
  const { data: pendente, error } = await args.db
    .from("atend_avaliacoes")
    .select("id")
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId)
    .eq("status", "pendente")
    .not("solicitacao_wa_message_id", "is", null)
    .not("solicitacao_wa_message_id", "like", `${TRAVA_ENVIO_PESQUISA}%`)
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
