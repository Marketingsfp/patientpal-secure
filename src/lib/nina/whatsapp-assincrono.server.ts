/**
 * Resposta da Nina fora da requisição da Meta (17/10/2026).
 *
 * Com a chave `nina_whatsapp_assincrono` ligada na clínica, o webhook grava a
 * mensagem, registra uma tarefa e responde "ok" à Meta na hora. O banco (pg_net)
 * aciona `/api/public/nina/processar`, que gera e envia a resposta pela MESMA
 * função de sempre (`processarRespostaWhatsappNina`). Uma varredura do banco
 * aciona de novo o que não começou ou parou no meio.
 *
 * Por que pelo banco: o Cloudflare corta trabalho feito depois da resposta em
 * 30 s, e parte das respostas da Nina passa disso. A chamada aberta pelo banco
 * é uma requisição nova, sem esse corte.
 *
 * Plano: docs/nina/plano-webhook-assincrono-2026-10-17.html
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { textoDaEntradaGravada } from "./entrada-whatsapp";
import { esperaRetryWatchdog } from "./watchdog";

export const FLAG_WHATSAPP_ASSINCRONO = "nina_whatsapp_assincrono";
const NOME_TOKEN = "nina-processar";

/** Chave da clínica. Qualquer falha de leitura mantém o caminho de sempre. */
export async function respostaAssincronaLigada(admin: any, clinicaId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("clinica_feature_flags")
      .select("ativo")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_WHATSAPP_ASSINCRONO)
      .maybeSingle();
    return !error && data?.ativo === true;
  } catch {
    return false;
  }
}

/**
 * Registra a tarefa e pede ao banco para acionar a resposta. `true` = a Nina
 * vai responder fora desta requisição. `false` = o webhook responde como antes.
 * Reentrega da Meta devolve a tarefa já existente, sem acionar de novo.
 */
export async function despacharRespostaNina(
  admin: any,
  args: {
    clinicaId: string;
    mensagemId: string;
    audioFalhou: boolean;
    phoneNumberId: string | null;
  },
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("nina_whatsapp_despachar", {
      _clinica_id: args.clinicaId,
      _mensagem_id: args.mensagemId,
      _audio_falhou: args.audioFalhou,
      _phone_number_id: args.phoneNumberId,
    });
    return !error && typeof data === "string" && data.length > 0;
  } catch {
    return false;
  }
}

const tarefaSchema = z.object({ tarefa: z.string().uuid(), token: z.string().uuid() }).strict();

type TarefaAssumida = {
  clinica_id: string | null;
  mensagem_id: string | null;
  audio_falhou: boolean;
  phone_number_id: string | null;
  modo: "responder" | "encaminhar" | "diagnostico";
  diagnostico_segundos: number | null;
  tentativas: number;
};

type ResultadoTarefa = { resultado: "concluida" | "repetir" | "falhou"; erro?: string };

type EstadoConversa = {
  id?: string | null;
  atribuida_user_id?: string | null;
  departamento_id?: string | null;
} | null;

export type DependenciasTarefa = {
  admin: any;
  processar: (entrada: any) => Promise<{ pendente?: boolean } | undefined | void>;
  carregarConfig: (clinicaId: string) => Promise<any>;
  estadoConversaPorTelefone: (clinicaId: string, telefone: string) => Promise<EstadoConversa>;
  ninaPodeResponder: (estado: EstadoConversa) => boolean;
  ninaDesativada: (clinicaId: string) => Promise<boolean>;
  atribuirAtendenteOnline: (args: {
    clinicaId: string;
    conversaId: string;
    departamentoId: string | null;
  }) => Promise<unknown>;
  encaminharParaHumano: (args: any) => Promise<{ ok: boolean }>;
  esperar?: (ms: number) => Promise<void>;
  heartbeatMs?: number;
};

/** Mesmo critério de reentrega da Meta: a execução já começou ou a entrada já foi tratada. */
function entradaJaTratada(m: any): boolean {
  return Boolean(
    m.execucao_id ||
    m.tratada_internamente ||
    ["completed", "failed", "handoff"].includes(String(m.nina_status ?? "")),
  );
}

async function lerEntrada(admin: any, clinicaId: string, mensagemId: string) {
  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .select("*")
    .eq("id", mensagemId)
    .eq("clinica_id", clinicaId)
    .eq("direction", "in")
    .maybeSingle();
  if (error) throw new Error("ENTRADA_INDISPONIVEL");
  return data as Record<string, any> | null;
}

async function responder(t: TarefaAssumida, d: DependenciasTarefa): Promise<ResultadoTarefa> {
  const clinicaId = t.clinica_id!;
  const msg = await lerEntrada(d.admin, clinicaId, t.mensagem_id!);
  if (!msg) return { resultado: "falhou", erro: "ENTRADA_AUSENTE" };
  if (entradaJaTratada(msg)) return { resultado: "concluida" };
  const cfg = await d.carregarConfig(clinicaId);
  if (!cfg?.access_token) return { resultado: "falhou", erro: "WHATSAPP_NOT_CONFIGURED" };
  const from = String(msg.from_number ?? "");
  const fromDigits = from.replace(/\D/g, "");
  // O estado é relido aqui: se uma pessoa assumiu a conversa nesse meio-tempo, ela manda.
  const estado = from ? await d.estadoConversaPorTelefone(clinicaId, from) : null;
  const convId = estado?.id ?? null;
  if (!d.ninaPodeResponder(estado) || (await d.ninaDesativada(clinicaId))) {
    if (convId && !estado?.atribuida_user_id) {
      try {
        await d.atribuirAtendenteOnline({
          clinicaId,
          conversaId: convId,
          departamentoId: estado?.departamento_id ?? null,
        });
      } catch {
        console.error("[nina-processar] auto-atribuição falhou");
      }
    }
    return { resultado: "concluida" };
  }
  const tipo = String(msg.tipo ?? "text");
  try {
    const r = await d.processar({
      clinicaId,
      cfg: { ...cfg, access_token: cfg.access_token },
      phoneNumberId: t.phone_number_id ?? cfg.phone_number_id ?? null,
      displayPhoneNumber: msg.to_number ?? cfg.display_phone_number ?? null,
      webhookPhoneNumberId: t.phone_number_id,
      from,
      fromDigits,
      convId,
      msgInserida: msg,
      textoPaciente: textoDaEntradaGravada(msg),
      audioFalhou: t.audio_falhou,
      ehAudio: tipo === "audio",
      tipo,
    });
    // "Conversa ocupada": antes a Meta reenviava; agora a própria fila tenta de novo.
    return r?.pendente
      ? { resultado: "repetir", erro: "CONVERSA_OCUPADA" }
      : { resultado: "concluida" };
  } catch (e) {
    const { ErroAgrupamentoNina } = await import("./agrupamento-turno");
    if (e instanceof ErroAgrupamentoNina && e.podeRepetirEntrada)
      return { resultado: "repetir", erro: "AGRUPAMENTO_PENDENTE" };
    // Mesmo desfecho do webhook: sem nova tentativa. O vigia do turno recupera o
    // lote que já tinha começado.
    return { resultado: "falhou", erro: "PROCESSAMENTO_FALHOU" };
  }
}

/** Depois de várias tentativas sem sucesso: o aviso padrão e a fila da equipe. */
async function encaminhar(t: TarefaAssumida, d: DependenciasTarefa): Promise<ResultadoTarefa> {
  const clinicaId = t.clinica_id!;
  const msg = await lerEntrada(d.admin, clinicaId, t.mensagem_id!);
  if (!msg) return { resultado: "falhou", erro: "ENTRADA_AUSENTE" };
  if (entradaJaTratada(msg)) return { resultado: "concluida" };
  const estado = msg.from_number
    ? await d.estadoConversaPorTelefone(clinicaId, String(msg.from_number))
    : null;
  if (!estado?.id) return { resultado: "falhou", erro: "CONVERSA_AUSENTE" };
  const { data: conversa, error } = await d.admin
    .from("atend_conversas")
    .select("owner_type,ai_enabled,ultima_msg_em,nina_fluxo_estado")
    .eq("id", estado.id)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error("CONVERSA_INDISPONIVEL");
  // Já está com gente (ou sem a Nina): nada a avisar.
  if (!conversa || conversa.owner_type !== "AI" || !conversa.ai_enabled)
    return { resultado: "concluida" };
  const r = await d.encaminharParaHumano({
    clinicaId,
    conversaId: estado.id,
    motivo: "NINA_PROCESSING_FAILED: falha técnica ao preparar ou gerar a resposta",
    resumo:
      "A Nina não conseguiu concluir este turno. A equipe deve revisar o histórico e eventuais operações registradas antes de continuar o atendimento.",
    solicitadoPor: "SISTEMA",
    somenteSeNina: {
      ultimaMsgEm: conversa.ultima_msg_em,
      sessaoId: conversa.nina_fluxo_estado?.session_id ?? null,
    },
  });
  return r.ok ? { resultado: "concluida" } : { resultado: "falhou", erro: "ENCAMINHAMENTO_FALHOU" };
}

/** Handler da rota `/api/public/nina/processar`. Só ids e token chegam pela chamada do banco. */
export async function executarTarefaWhatsapp(
  request: Request,
  d: DependenciasTarefa,
): Promise<Response> {
  const recebido = request.headers.get("x-job-token") ?? "";
  if (!recebido || recebido.length > 512) return new Response("Unauthorized", { status: 401 });
  const { data: segredo, error: erroSegredo } = await d.admin
    .from("sistema_job_tokens")
    .select("token")
    .eq("nome", NOME_TOKEN)
    .maybeSingle();
  const a = Buffer.from(recebido),
    b = Buffer.from(segredo?.token ?? "");
  if (erroSegredo || !b.length || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("Unauthorized", { status: 401 });
  let pedido: z.infer<typeof tarefaSchema>;
  try {
    const texto = await request.text();
    if (texto.length > 1024) return new Response("Invalid task", { status: 400 });
    pedido = tarefaSchema.parse(JSON.parse(texto));
  } catch {
    return new Response("Invalid task", { status: 400 });
  }
  const args = { _tarefa: pedido.tarefa, _token: pedido.token };
  const { data: linhas, error: erroAssumir } = await d.admin.rpc("nina_whatsapp_assumir", args);
  if (erroAssumir) return Response.json({ erro: "RESERVA_INDISPONIVEL" }, { status: 503 });
  const tarefa = (Array.isArray(linhas) ? linhas[0] : linhas) as TarefaAssumida | null;
  // Chamada antiga, repetida ou de tarefa já concluída: nada a fazer.
  if (!tarefa?.modo) return Response.json({ ignorada: true });

  let fila: Promise<unknown> = Promise.resolve();
  const timer = setInterval(() => {
    fila = fila
      .then(() => d.admin.rpc("nina_whatsapp_renovar", args))
      .catch(() => {
        /* a varredura recupera a tarefa se a reserva vencer */
      });
  }, d.heartbeatMs ?? 20_000);
  let r: ResultadoTarefa = { resultado: "falhou", erro: "TAREFA_INTERROMPIDA" };
  try {
    if (tarefa.modo === "diagnostico") {
      // Prova de que uma chamada aberta pelo banco passa dos 30 s do Cloudflare.
      const ms = Math.min(280, Math.max(1, Number(tarefa.diagnostico_segundos) || 1)) * 1000;
      await (d.esperar ?? ((x) => new Promise<void>((ok) => setTimeout(ok, x))))(ms);
      r = { resultado: "concluida" };
    } else if (!tarefa.clinica_id || !tarefa.mensagem_id) {
      r = { resultado: "falhou", erro: "TAREFA_INCOMPLETA" };
    } else {
      r = tarefa.modo === "encaminhar" ? await encaminhar(tarefa, d) : await responder(tarefa, d);
    }
    return Response.json({ resultado: r.resultado });
  } catch {
    r = { resultado: "falhou", erro: "TAREFA_FALHOU" };
    return Response.json({ erro: "TAREFA_FALHOU" }, { status: 503 });
  } finally {
    clearInterval(timer);
    await fila;
    const { error } = await d.admin.rpc("nina_whatsapp_finalizar", {
      ...args,
      _resultado: r.resultado,
      _aguardar_ms: r.resultado === "repetir" ? esperaRetryWatchdog(tarefa.tentativas || 1) : 0,
      _erro: r.erro ?? null,
    });
    // Se cair aqui, a reserva vence e a varredura do banco retoma a tarefa.
    if (error) console.error("[nina-processar] desfecho pendente de recuperação pela varredura");
  }
}
