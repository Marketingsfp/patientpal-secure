import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import {
  loadWhatsAppConfig,
  metaSendText,
  gerarRespostaNina,
} from "@/lib/whatsapp.server";

function verifySignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function textoLimpo(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

const HEADERS_RELEVANTES = [
  "x-hub-signature-256",
  "x-hub-signature",
  "content-type",
  "user-agent",
  "x-forwarded-for",
];

/** Registra a requisição crua antes de qualquer validação. Nunca lança. */
async function registrarLogWebhook(
  clinicaId: string,
  metodo: string,
  request: Request,
  corpo: string,
): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const headers: Record<string, string> = {};
    for (const nome of HEADERS_RELEVANTES) {
      const v = request.headers.get(nome);
      if (v) headers[nome] = v;
    }
    const { data, error } = await supabaseAdmin
      .from("whatsapp_webhook_logs")
      .insert({
        clinica_id: clinicaId,
        metodo,
        headers,
        assinatura: request.headers.get("x-hub-signature-256"),
        corpo: corpo.slice(0, 8192),
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("whatsapp webhook log insert error", error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.error("whatsapp webhook log error", e);
    return null;
  }
}

/** Preenche o campo `resultado` do log. Nunca lança. */
async function marcarResultado(logId: string | null, resultado: string) {
  if (!logId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("whatsapp_webhook_logs")
      .update({ resultado: resultado.slice(0, 500) })
      .eq("id", logId);
  } catch (e) {
    console.error("whatsapp webhook log update error", e);
  }
}

async function registrarStatusWhatsapp(clinicaId: string, ok: boolean, erro?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("whatsapp_configs")
    .update({
      ultimo_teste_em: new Date().toISOString(),
      ultimo_teste_ok: ok,
      ultimo_teste_erro: ok ? null : (erro ?? "Falha ao enviar resposta automática").slice(0, 500),
    })
    .eq("clinica_id", clinicaId);
}

export const Route = createFileRoute("/api/public/whatsapp/$clinicaId")({
  server: {
    handlers: {
      // Meta envia GET para verificar o webhook na hora de configurar
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const logId = await registrarLogWebhook(params.clinicaId, "GET", request, url.search);

        const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
        if (!cfg) {
          await marcarResultado(logId, "erro:clínica sem configuração de WhatsApp");
          return new Response("Not found", { status: 404 });
        }

        if (mode === "subscribe" && token && token === cfg.verify_token) {
          await marcarResultado(logId, "processado_ok");
          return new Response(challenge ?? "", { status: 200 });
        }
        await marcarResultado(logId, "erro:verify_token inválido");
        return new Response("Forbidden", { status: 403 });
      },

      // Meta envia POST para cada evento
      POST: async ({ request, params }) => {
        // FASE 1 (telemetria) — apenas medição do caminho de recebimento.
        // Nenhuma validação, ordem ou regra do webhook foi alterada.
        const { iniciarTraceServidor } = await import("@/lib/atendimento/latencia.server");
        const trace = iniciarTraceServidor({ fluxo: "recv" });
        trace.marcar("RECV_T0_WEBHOOK_RECEIVED");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rawBody = await request.text();
        const logId = await registrarLogWebhook(params.clinicaId, "POST", request, rawBody);
        let resultado = "evento_ignorado";
        try {
          const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
          if (!cfg) {
            resultado = "erro:clínica sem configuração de WhatsApp";
            return new Response("Not found", { status: 404 });
          }
          if (!cfg.access_token) {
            resultado = "erro:access token ausente";
            return new Response("Not configured", { status: 412 });
          }

          const sigHeader = request.headers.get("x-hub-signature-256");
          // Assinatura não confere (ou App Secret vazio/errado): registramos, mas
          // NUNCA descartamos a mensagem do paciente.
          const assinaturaOk = Boolean(
            cfg.app_secret && verifySignature(cfg.app_secret, rawBody, sigHeader),
          );
          if (!assinaturaOk) resultado = "assinatura_invalida";
          trace.marcar("RECV_T1_SIGNATURE_VALIDATED");
          trace.marcar("RECV_T2_CONFIG_READY");

          let payload: any;
          try {
            payload = JSON.parse(rawBody);
          } catch {
            resultado = "erro:corpo não é JSON válido";
            return new Response("Bad request", { status: 400 });
          }

          trace.marcar("RECV_T3_PAYLOAD_PARSED");
          let processou = false;
          const entries: any[] = payload?.entry ?? [];
          for (const entry of entries) {
            const changes: any[] = entry?.changes ?? [];
            for (const change of changes) {
              const value = change?.value ?? {};
              const webhookPhoneNumberId = textoLimpo(value?.metadata?.phone_number_id);
              const displayPhoneNumber =
                textoLimpo(value?.metadata?.display_phone_number) ?? cfg.display_phone_number;
              const phoneNumberId = webhookPhoneNumberId ?? textoLimpo(cfg.phone_number_id);
              const messages: any[] = value?.messages ?? [];
              for (const msg of messages) {
                processou = true;
                const from = String(msg.from ?? "");
                const wa_message_id = String(msg.id ?? "");
                const tipoBruto = String(msg.type ?? "text");
                const tipo = tipoBruto === "voice" ? "audio" : tipoBruto;
                const ehAudio = tipo === "audio";

                // Texto do paciente que a Nina vai processar (áudio vira transcrição).
                let textoPaciente = tipo === "text" ? String(msg.text?.body ?? "") : "";
                let transcricao: string | null = null;
                let audioFalhou = false;
                let mediaMime: string | null = null;

                if (ehAudio && cfg.access_token) {
                  const mediaId = String(msg.audio?.id ?? msg.voice?.id ?? "");
                  if (mediaId) {
                    const { transcreverAudioWhatsapp } =
                      await import("@/lib/whatsapp-midia.server");
                    const r = await transcreverAudioWhatsapp(mediaId, cfg.access_token);
                    mediaMime = r.mime;
                    if (r.texto) {
                      transcricao = r.texto;
                      textoPaciente = r.texto;
                    } else {
                      audioFalhou = true;
                      if (r.erro) console.error("transcrição de áudio falhou", r.erro);
                    }
                  } else {
                    audioFalhou = true;
                  }
                }

                const body = ehAudio
                  ? transcricao
                    ? `🎤 ${transcricao}`
                    : "🎤 [áudio não transcrito]"
                  : tipo === "text"
                    ? String(msg.text?.body ?? "")
                    : `[${tipo}]`;

                // Idempotência: `wa_message_id` é único. Se a Meta reenviar o
                // mesmo evento (retry/duplicidade), o insert falha aqui e a
                // mensagem NÃO é processada de novo — nada de resposta dupla
                // nem de reabertura repetida.
                trace.marcar("RECV_T4_DB_INSERT_START");
                const { data: msgInserida, error: insErr } = await supabaseAdmin
                  .from("whatsapp_mensagens")
                  .insert({
                    clinica_id: params.clinicaId,
                    wa_message_id,
                    direction: "in",
                    from_number: from,
                    to_number: displayPhoneNumber,
                    body,
                    tipo,
                    transcricao,
                    media_mime: mediaMime,
                    status: "received",
                    enviada_por: "paciente",
                    raw: msg,
                  })
                  .select("id")
                  .maybeSingle();
                trace.marcar("RECV_T5_DB_INSERT_DONE");
                trace.marcar("RECV_T6_REALTIME_AVAILABLE");
                if (insErr) {
                  const duplicada =
                    (insErr as { code?: string }).code === "23505" ||
                    /duplicate key/i.test(insErr.message ?? "");
                  if (duplicada) {
                    resultado = "duplicada_ignorada";
                    continue;
                  }
                  console.error("whatsapp mensagem insert error", insErr.message);
                }

                // FASE 4 — Stale Response Guard: cada mensagem recebida avança
                // a revisão da conversa. Uma geração da Nina em andamento
                // passa a ser obsoleta a partir daqui.
                try {
                  const { incrementarRevisaoConversa } = await import(
                    "@/lib/nina/revisao-conversa.server"
                  );
                  await incrementarRevisaoConversa({
                    clinicaId: params.clinicaId,
                    telefone: String(from ?? "").replace(/\D/g, "") || from,
                  });
                } catch (e) {
                  console.error("[nina] revisão da conversa não avançou", e);
                }

                // ---------------------------------------------------------
                // Verificação de paciente pelo site (API v1.2).
                // Esta checagem vem ANTES de reabrir conversa e antes de
                // decidir se a Nina responde: a mensagem é só um código de
                // confirmação, não é atendimento. Quando ela é reconhecida,
                // marcamos a mensagem como tratada internamente, respondemos
                // uma linha curta e encerramos — sem conversa nova, sem
                // tarefa e sem acionar a assistente.
                if (textoPaciente) {
                  try {
                    const { reconhecerCodigoVerificacao } = await import(
                      "@/lib/integracoes/verificacao-v1.server"
                    );
                    const r = await reconhecerCodigoVerificacao({
                      db: supabaseAdmin as never,
                      clinicaId: params.clinicaId,
                      texto: textoPaciente,
                      fromNumber: from,
                      waMessageId: wa_message_id,
                    });
                    if (r.tratada) {
                      const idMsg = (msgInserida as { id?: string } | null)?.id ?? null;
                      if (idMsg) {
                        await supabaseAdmin
                          .from("whatsapp_mensagens")
                          .update({ tratada_internamente: true } as never)
                          .eq("id", idMsg);
                      }
                      if (r.resposta && phoneNumberId && cfg.access_token) {
                        // Janela de 24h aberta pelo próprio paciente. Uma linha,
                        // sem nome e sem nenhum dado do cadastro.
                        await metaSendText(
                          phoneNumberId,
                          cfg.access_token,
                          from,
                          r.resposta,
                        ).catch((e) =>
                          console.error("[verificacao] resposta ao paciente falhou", e),
                        );
                      }
                      resultado = "verificacao_tratada";
                      continue;
                    }
                  } catch (e) {
                    // Falha aqui não pode engolir a mensagem do paciente:
                    // segue o fluxo normal de atendimento.
                    console.error("[verificacao] reconhecimento falhou", e);
                  }
                }


                // Antes de qualquer coisa, vence quem já passou do prazo —
                // assim uma conversa parada não fica presa na Nina.
                try {
                  const { processarTimeoutsEsperaPaciente } = await import(
                    "@/lib/nina/espera-timeout.server"
                  );
                  await processarTimeoutsEsperaPaciente({
                    clinicaId: params.clinicaId,
                    limite: 10,
                  });
                } catch (e) {
                  console.error("[nina-timeout] varredura no webhook falhou", e);
                }

                // Mensagem nova do paciente reabre automaticamente a conversa
                // encerrada e devolve o atendimento ao fluxo inicial da Nina.
                const fromDigits = String(from ?? "").replace(/\D/g, "");
                if (fromDigits) {
                  const { reabrirConversaPorMensagemPaciente } = await import(
                    "@/lib/atendimento/handoff.server"
                  );
                  await reabrirConversaPorMensagemPaciente({
                    clinicaId: params.clinicaId,
                    telefone: fromDigits,
                  });
                  // O paciente respondeu: qualquer prazo de espera cai.
                  const { limparEsperaPorTelefone } = await import(
                    "@/lib/nina/espera-paciente.server"
                  );
                  await limparEsperaPorTelefone(params.clinicaId, fromDigits);
                }


                // Atendimento híbrido: a Nina é o 1º nível e responde sempre,
                // MENOS quando a conversa já está com uma pessoa (ou na fila
                // aguardando alguém assumir). O dono da conversa manda.
                const { estadoConversaPorTelefone, ninaPodeResponder } = await import(
                  "@/lib/atendimento/handoff.server"
                );
                const convEstado = from
                  ? await estadoConversaPorTelefone(params.clinicaId, from)
                  : null;
                const iaLiberada = ninaPodeResponder(convEstado);

                // Se a clínica desligou a Nina (flag `nina_desativada`), não responde nada.
                const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
                const ninaOff = await ninaDesativadaNaClinica(params.clinicaId);
                const deveResponder =
                  !ninaOff &&
                  iaLiberada &&
                  (Boolean(textoPaciente) ||
                    audioFalhou ||
                    ["image", "document", "sticker"].includes(tipo));

                // Se a conversa é de gente (Nina desligada ou já encaminhada) e
                // ainda não tem responsável, distribui na hora para quem está
                // online com menos conversas. Sem ninguém online, ela fica na
                // fila "Não atribuídas".
                const convId = (convEstado as { id?: string | null } | null)?.id ?? null;
                const jaTemDono =
                  (convEstado as { atribuida_user_id?: string | null } | null)
                    ?.atribuida_user_id ?? null;
                if (!deveResponder && convId && !jaTemDono) {
                  try {
                    const { atribuirAtendenteOnline } = await import(
                      "@/lib/atendimento/handoff.server"
                    );
                    await atribuirAtendenteOnline({
                      clinicaId: params.clinicaId,
                      conversaId: convId,
                      departamentoId:
                        (convEstado as { departamento_id?: string | null } | null)
                          ?.departamento_id ?? null,
                    });
                  } catch (e) {
                    console.error("[whatsapp] auto-atribuição falhou", e);
                  }
                }


                if (deveResponder) {
                  // FASE 3 — a trava da conversa vale por TODO o turno e é
                  // solta no finally, inclusive quando a execução falha.
                  let loteId = "";
                  let lockTurno: import("@/lib/nina/lock-conversa.server").LockConversa | null =
                    null;
                  let execTurno: string | null = null;
                  let revisaoTurno = 0;
                  let turnoSuperseded = false;
                  try {
                    if (!phoneNumberId) {
                      throw new Error(
                        "WhatsApp não configurado: Phone Number ID ausente na configuração e no webhook da Meta.",
                      );
                    }
                    const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } =
                      await import("@/lib/whatsapp-midia.server");
                    let reply = "";
                    // Auditoria: id da execução que produziu esta resposta.
                    // `traceId` é o identificador do turno (FASE 1): preenchido
                    // por `gerarRespostaNina` e usado para ligar a mensagem
                    // entregue ao registro da execução.
                    const auditoriaNina: { execucaoId?: string | null; traceId?: string | null } =
                      {};
                    // Mensagens de entrada reais desta resposta. O paciente pode
                    // ter escrito em partes: pegamos as mensagens dele ainda sem
                    // resposta, na ordem em que chegaram.
                    const entradasNina = await (async () => {
                      const atual = (msgInserida as { id?: string } | null)?.id ?? null;
                      try {
                        const ultimaSaida = await supabaseAdmin
                          .from("whatsapp_mensagens")
                          .select("created_at")
                          .eq("clinica_id", params.clinicaId)
                          .eq("to_number", from)
                          .eq("direction", "out")
                          .order("created_at", { ascending: false })
                          .limit(1)
                          .maybeSingle();
                        let q = supabaseAdmin
                          .from("whatsapp_mensagens")
                          .select("id, created_at")
                          .eq("clinica_id", params.clinicaId)
                          .eq("from_number", from)
                          .eq("direction", "in")
                          .order("created_at", { ascending: true })
                          .limit(10);
                        const corte = (ultimaSaida.data as { created_at?: string } | null)
                          ?.created_at;
                        if (corte) q = q.gt("created_at", corte);
                        const { data } = await q;
                        const ids = (data ?? []).map((m: { id: string }) => m.id);
                        return ids.length ? ids : atual ? [atual] : [];
                      } catch {
                        return atual ? [atual] : [];
                      }
                    })();
                    // FASE 2 — Burst Aggregation: mensagens seguidas do mesmo
                    // paciente viram UM turno lógico para a Nina. A mensagem já
                    // foi persistida e publicada no Realtime acima; aqui só a
                    // decisão da IA espera a quiet window.
                    let entradasTurno = entradasNina;
                    if (textoPaciente) {
                      const { aguardarTurnoNina } = await import("@/lib/nina/burst.server");
                      const turno = await aguardarTurnoNina({
                        clinicaId: params.clinicaId,
                        telefone: fromDigits || from,
                        conversaId: convId,
                        mensagemId: (msgInserida as { id?: string } | null)?.id ?? null,
                        textoAtual: textoPaciente,
                        mensagensFallback: entradasNina,
                      });
                      if (!turno) {
                        // Uma mensagem mais nova do mesmo paciente assume o
                        // turno: esta invocação encerra sem responder.
                        const { registrarTurnoSemModelo } = await import(
                          "@/lib/nina/rastreio/turno.server"
                        );
                        await registrarTurnoSemModelo({
                          clinicaId: params.clinicaId,
                          conversaId: convId,
                          mensagensEntrada: entradasNina,
                          origem: "nenhuma",
                          motivo: "turno assumido por mensagem mais nova (agrupamento)",
                        });
                        continue;
                      }
                      loteId = turno.batchId;
                      lockTurno = turno.lock;
                      revisaoTurno = turno.revisao;
                      if (turno.mensagens.length) entradasTurno = turno.mensagens;
                      reply = await gerarRespostaNina(params.clinicaId, turno.texto, from, {
                        auditoria: auditoriaNina,
                        mensagensEntrada: entradasTurno,
                        lote: { batchId: turno.batchId || null, revisao: turno.revisao || null },
                        revisao: turno.revisao
                          ? { telefone: fromDigits || from, valor: turno.revisao }
                          : undefined,
                      });
                      execTurno = auditoriaNina.execucaoId ?? null;
                      // Instrumentação mínima para métricas: marca quais
                      // mensagens recebidas foram realmente processadas por
                      // esta execução. Não altera decisão, resposta ou fluxo.
                      if (auditoriaNina.execucaoId && entradasTurno.length) {
                        try {
                          await supabaseAdmin
                            .from("whatsapp_mensagens")
                            .update({ execucao_id: auditoriaNina.execucaoId })
                            .in("id", entradasTurno)
                            .is("execucao_id", null);
                        } catch (e) {
                          console.error("[nina] marcação de execução na entrada falhou", e);
                        }
                      }
                    } else if (audioFalhou) {
                      reply = RESPOSTA_AUDIO_FALHOU;
                    } else {
                      reply = respostaMidiaNaoSuportada(tipo);
                    }

                    // Revalida o dono ANTES de enviar: um atendente pode ter
                    // assumido enquanto o modelo pensava. Nesse caso, a resposta
                    // é descartada para o paciente não receber IA e humano juntos.
                    if (reply && from) {
                      const agora = await estadoConversaPorTelefone(params.clinicaId, from);
                      if (!ninaPodeResponder(agora)) {
                        reply = "";
                        // FASE 1 — atendente assumiu durante a geração.
                        const { registrarTurnoSemModelo } = await import(
                          "@/lib/nina/rastreio/turno.server"
                        );
                        await registrarTurnoSemModelo({
                          ...(auditoriaNina.traceId ? { turnoId: auditoriaNina.traceId } : {}),
                          clinicaId: params.clinicaId,
                          conversaId: convId,
                          mensagensEntrada: entradasNina,
                          batchId: loteId || null,
                          revisaoConversa: revisaoTurno || null,
                          origem: "nenhuma",
                          motivo: "atendente humano assumiu a conversa antes do envio",
                        });
                      }
                    }

                    // Encerramento automático: decidido ANTES do envio (para
                    // completar a mensagem final), aplicado SÓ depois que o
                    // envio for confirmado.
                    let encerrarConversaId: string | null = null;
                    if (reply && from && textoPaciente) {
                      try {
                        const { avaliarEncerramentoAutomatico } = await import(
                          "@/lib/nina/encerramento-automatico.server"
                        );
                        const av = await avaliarEncerramentoAutomatico({
                          clinicaId: params.clinicaId,
                          telefone: from,
                          mensagemPaciente: textoPaciente,
                          resposta: reply,
                        });
                        if (av.encerrar && av.conversaId) {
                          reply = av.resposta;
                          encerrarConversaId = av.conversaId;
                        }
                      } catch (e) {
                        console.error("[nina] avaliação de encerramento falhou", e);
                      }
                    }
                    // FASE 4 — antes de QUALQUER envio: a resposta ainda vale?
                    if (reply && revisaoTurno) {
                      const { respostaObsoleta } = await import(
                        "@/lib/nina/revisao-conversa.server"
                      );
                      const obsoleta = await respostaObsoleta({
                        clinicaId: params.clinicaId,
                        telefone: fromDigits || from,
                        revisaoProcessada: revisaoTurno,
                      });
                      if (obsoleta) {
                        // Chegou mensagem nova durante a geração: a resposta
                        // antiga é descartada e o próximo lote reprocessa com
                        // o contexto completo.
                        console.warn("[nina] resposta obsoleta descartada", {
                          revisao_processada: revisaoTurno,
                          lote: loteId || null,
                        });
                        turnoSuperseded = true;
                        reply = "";
                        // FASE 1 — o turno existiu e não entregou nada: fica
                        // registrado com o motivo, sem inventar uma entrega.
                        const { registrarTurnoSemModelo } = await import(
                          "@/lib/nina/rastreio/turno.server"
                        );
                        await registrarTurnoSemModelo({
                          ...(auditoriaNina.traceId ? { turnoId: auditoriaNina.traceId } : {}),
                          clinicaId: params.clinicaId,
                          conversaId: convId,
                          mensagensEntrada: entradasNina,
                          batchId: loteId || null,
                          revisaoConversa: revisaoTurno || null,
                          origem: "nenhuma",
                          motivo: "resposta descartada por revisão obsoleta da conversa",
                        });
                      }
                    }
                    if (reply) {


                      // Paciente mandou áudio → Nina responde falando (se a
                      // clínica não desligou). Qualquer falha cai para texto.
                      let audioEnviado = false;
                      let precisaTextoCompleto = true;
                      if (ehAudio && cfg.access_token) {
                        try {
                          const {
                            respostaAudioDesativada,
                            prepararParaFala,
                            pareceLista,
                            resumoFalado,
                            sintetizarFala,
                            LIMITE_FALA_CURTA,
                          } = await import("@/lib/nina-audio.server");
                          if (!(await respostaAudioDesativada(params.clinicaId))) {
                            const longa = reply.length > LIMITE_FALA_CURTA || pareceLista(reply);
                            const falado = longa ? resumoFalado(reply) : prepararParaFala(reply);
                            const audio = await sintetizarFala(falado);
                            if (audio) {
                              const { metaUploadMedia, metaSendAudio } =
                                await import("@/lib/whatsapp.server");
                              const mediaId = await metaUploadMedia(
                                phoneNumberId,
                                cfg.access_token,
                                audio.bytes,
                                audio.mime,
                                `nina.${audio.ext}`,
                              );
                              const { wa_message_id: audioId } = await metaSendAudio(
                                phoneNumberId,
                                cfg.access_token,
                                from,
                                mediaId,
                              );
                              await supabaseAdmin.from("whatsapp_mensagens").insert({
                                clinica_id: params.clinicaId,
                                wa_message_id: audioId,
                                direction: "out",
                                from_number: displayPhoneNumber,
                                to_number: from,
                                body: `🎤 ${falado}`,
                                tipo: "audio",
                                transcricao: falado,
                                media_mime: audio.mime,
                                status: "sent",
                                enviada_por: "nina",
                                execucao_id: auditoriaNina.execucaoId ?? null,
                              });
                              audioEnviado = true;
                              precisaTextoCompleto = longa;
                            }
                          }
                        } catch (e) {
                          console.error("Nina resposta em áudio falhou (caindo para texto)", e);
                        }
                      }

                      if (!audioEnviado || precisaTextoCompleto) {
                        const { wa_message_id: outId } = await metaSendText(
                          phoneNumberId,
                          cfg.access_token,
                          from,
                          reply,
                        );
                        const { data: msgOut } = await supabaseAdmin
                          .from("whatsapp_mensagens")
                          .insert({
                            clinica_id: params.clinicaId,
                            wa_message_id: outId,
                            direction: "out",
                            from_number: displayPhoneNumber,
                            to_number: from,
                            body: reply,
                            tipo: "text",
                            status: "sent",
                            enviada_por: "nina",
                            execucao_id: auditoriaNina.execucaoId ?? null,
                          })
                          .select("id")
                          .maybeSingle();
                        // FASE 6 — o snapshot de confiança passa a apontar para
                        // a mensagem que o paciente realmente recebeu.
                        try {
                          const { vincularSnapshotMensagemEnviada } = await import(
                            "@/lib/nina/confidence-engine.server"
                          );
                          await vincularSnapshotMensagemEnviada({
                            clinicaId: params.clinicaId,
                            execucaoId: auditoriaNina.execucaoId ?? null,
                            outgoingMessageId: (msgOut as { id?: string } | null)?.id ?? null,
                          });
                        } catch {
                          // Vínculo é auditoria: nunca interrompe o atendimento.
                        }
                        // FASE 1 — liga o turno à mensagem realmente entregue.
                        try {
                          const { gravarEntregaDoTurno } = await import(
                            "@/lib/nina/rastreio/turno.server"
                          );
                          await gravarEntregaDoTurno({
                            clinicaId: params.clinicaId,
                            turnoId: auditoriaNina.traceId ?? null,
                            execucaoId: auditoriaNina.execucaoId ?? null,
                            conversaId: convId,
                            outgoingMessageId: (msgOut as { id?: string } | null)?.id ?? null,
                            canal: "whatsapp",
                          });
                        } catch {
                          // Rastreabilidade nunca interrompe o atendimento.
                        }
                      }

                      // Envio confirmado: agora sim a conversa é resolvida pelo
                      // MESMO mecanismo do botão "Resolver". Falha de envio nunca
                      // chega aqui (a exceção sobe), então não existe conversa
                      // resolvida sem mensagem final entregue.
                      if (encerrarConversaId) {
                        try {
                          const { resolverConversaPelaNina } = await import(
                            "@/lib/nina/encerramento-automatico.server"
                          );
                          await resolverConversaPelaNina({
                            clinicaId: params.clinicaId,
                            conversaId: encerrarConversaId,
                          });
                        } catch (e) {
                          console.error("[nina] falha ao resolver conversa automaticamente", e);
                        }
                      }

                      // Espera do paciente: só abre prazo quando a Nina fez
                      // uma pergunta necessária para continuar. Informação
                      // simples ou despedida não liga relógio nenhum.
                      if (!encerrarConversaId) {
                        try {
                          const { registrarEsperaPorTelefone } = await import(
                            "@/lib/nina/espera-paciente.server"
                          );
                          await registrarEsperaPorTelefone({
                            clinicaId: params.clinicaId,
                            telefone: from,
                            resposta: reply,
                          });
                        } catch (e) {
                          console.error("nina espera paciente error", e);
                        }
                      }




                      if (webhookPhoneNumberId && webhookPhoneNumberId !== cfg.phone_number_id) {
                        await supabaseAdmin
                          .from("whatsapp_configs")
                          .update({
                            phone_number_id: webhookPhoneNumberId,
                            display_phone_number: displayPhoneNumber,
                            ultimo_teste_em: new Date().toISOString(),
                            ultimo_teste_ok: true,
                            ultimo_teste_erro: null,
                          })
                          .eq("clinica_id", params.clinicaId);
                      }
                    }
                  } catch (e) {
                    console.error("Nina autoreply error", e);
                    await registrarStatusWhatsapp(
                      params.clinicaId,
                      false,
                      String((e as Error)?.message ?? e),
                    );
                  } finally {
                    if (loteId || lockTurno) {
                      try {
                        const { concluirTurnoNina } = await import("@/lib/nina/burst.server");
                        await concluirTurnoNina(
                          loteId,
                          execTurno,
                          lockTurno,
                          turnoSuperseded ? "SUPERSEDED" : "PROCESSED",
                        );
                      } catch (e) {
                        console.error("[nina] encerramento do turno falhou", e);
                      }
                    }
                  }
                }

                // Identidade do CONTATO WhatsApp (value.contacts[].profile.name).
                // Guardada em campo próprio: é quem está falando no número, e
                // nunca toca em cadastro de paciente. O campo legado
                // `contato_nome` só é preenchido quando ainda mostra o número.
                const perfilNome = textoLimpo(
                  (value?.contacts ?? []).find(
                    (c: any) => String(c?.wa_id ?? "").replace(/\D/g, "") === fromDigits,
                  )?.profile?.name ?? (value?.contacts ?? [])[0]?.profile?.name,
                );
                if (perfilNome && fromDigits) {
                  try {
                    const { data: convs } = await supabaseAdmin
                      .from("atend_conversas")
                      .select("id, contato_nome, contato_telefone, whatsapp_profile_name")
                      .eq("clinica_id", params.clinicaId)
                      .in("contato_telefone", [fromDigits, `+${fromDigits}`]);
                    const nome = perfilNome.slice(0, 120);
                    for (const c of (convs ?? []) as Array<{
                      id: string;
                      contato_nome: string | null;
                      whatsapp_profile_name: string | null;
                    }>) {
                      const patch: {
                        whatsapp_profile_name?: string;
                        whatsapp_profile_name_updated_at?: string;
                        contato_nome?: string;
                      } = {};
                      if ((c.whatsapp_profile_name ?? "").trim() !== nome) {
                        patch.whatsapp_profile_name = nome;
                        patch.whatsapp_profile_name_updated_at = new Date().toISOString();
                      }
                      const atual = (c.contato_nome ?? "").trim();
                      // vazio ou apenas dígitos/“+” = ainda está mostrando o número
                      const soNumero = atual === "" || /^\+?\d+$/.test(atual);
                      if (soNumero) patch.contato_nome = nome;
                      if (Object.keys(patch).length === 0) continue;
                      await supabaseAdmin.from("atend_conversas").update(patch).eq("id", c.id);
                    }
                  } catch (e) {
                    console.error("whatsapp perfil nome error", e);
                  }
                }
              }
            }
          }

          if (processou && resultado !== "assinatura_invalida") resultado = "processado_ok";
          return new Response("ok", { status: 200 });
        } catch (e) {
          resultado = `erro:${String((e as Error)?.message ?? e)}`;
          console.error("whatsapp webhook error", e);
          return new Response("ok", { status: 200 });
        } finally {
          await marcarResultado(logId, resultado);
          // Só tempos e etapas: o log de latência não recebe texto, telefone
          // nem qualquer dado do paciente.
          trace.publicar(resultado.startsWith("erro:") ? "erro" : "ok");
        }
      },
    },
  },
});
