import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { loadWhatsAppConfig, metaSendText } from "@/lib/whatsapp.server";

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
              // Recibos de entrega dos lembretes automáticos de consulta.
              // Nunca interrompe o processamento das mensagens.
              const statuses: any[] = value?.statuses ?? [];
              if (statuses.length > 0) {
                try {
                  const { registrarStatusEntregaConfirmacao } =
                    await import("@/lib/agenda/confirmacao-whatsapp.server");
                  await registrarStatusEntregaConfirmacao(params.clinicaId, statuses);
                } catch (e) {
                  console.error("[confirmacao] recibo de entrega falhou", e);
                }
              }
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
                const { persistirEntradaNina } =
                  await import("@/lib/nina/entrada-persistida.server");
                const entradaPersistida = await persistirEntradaNina(supabaseAdmin, {
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
                });
                const msgInserida = entradaPersistida.mensagem;
                trace.marcar("RECV_T5_DB_INSERT_DONE");
                trace.marcar("RECV_T6_REALTIME_AVAILABLE");
                if (entradaPersistida.consumida) {
                  resultado = "duplicada_ignorada";
                  continue;
                }
                if (entradaPersistida.repetida) {
                  // Retry reutiliza o conteúdo imutável da entrada, não o payload reenviado.
                  textoPaciente =
                    msgInserida.tipo === "audio"
                      ? (msgInserida.transcricao ?? "")
                      : msgInserida.tipo === "text"
                        ? (msgInserida.body ?? "")
                        : "";
                }

                // FASE 4 — Stale Response Guard: cada mensagem recebida avança
                // a revisão da conversa. Uma geração da Nina em andamento
                // passa a ser obsoleta a partir daqui.
                const { registrarRevisaoEntradaNina } =
                  await import("@/lib/nina/entrada-persistida.server");
                await registrarRevisaoEntradaNina(supabaseAdmin, {
                  clinicaId: params.clinicaId,
                  telefone: String(from ?? "").replace(/\D/g, "") || from,
                  mensagemId: msgInserida.id,
                });

                // ---------------------------------------------------------
                // Resposta ao lembrete automático de consulta ("1"/"2" ou
                // botão). Mesmo padrão da verificação abaixo: vem ANTES de
                // reabrir conversa e da Nina. Quando reconhecida, a agenda é
                // atualizada (respeitando mudanças da recepção), o paciente
                // recebe uma linha de fechamento e nada vai para a fila.
                try {
                  const { processarRespostaConfirmacao, enviarFechamentoConfirmacao } =
                    await import("@/lib/agenda/confirmacao-whatsapp.server");
                  const rc = await processarRespostaConfirmacao({
                    clinicaId: params.clinicaId,
                    from,
                    waMessageId: wa_message_id,
                    msg,
                    textoPaciente,
                  });
                  if (rc.tratada) {
                    const idMsg = (msgInserida as { id?: string } | null)?.id ?? null;
                    if (idMsg) {
                      await supabaseAdmin
                        .from("whatsapp_mensagens")
                        .update({ tratada_internamente: true } as never)
                        .eq("id", idMsg);
                    }
                    if (rc.resposta && phoneNumberId && cfg.access_token) {
                      await enviarFechamentoConfirmacao({
                        clinicaId: params.clinicaId,
                        confirmacaoId: rc.confirmacaoId,
                        phoneNumberId,
                        accessToken: cfg.access_token,
                        displayPhoneNumber: displayPhoneNumber ?? null,
                        to: from,
                        texto: rc.resposta,
                      }).catch((e) =>
                        console.error("[confirmacao] fechamento ao paciente falhou", e),
                      );
                    }
                    resultado = `confirmacao_consulta:${rc.resultado ?? "tratada"}`;
                    try {
                      const { registrarTurnoSemModelo } =
                        await import("@/lib/nina/rastreio/turno.server");
                      await registrarTurnoSemModelo({
                        clinicaId: params.clinicaId,
                        conversaId: null,
                        ...(idMsg ? { mensagensEntrada: [idMsg] } : {}),
                        origem: rc.resposta ? "gate" : "nenhuma",
                        motivo: "resposta ao lembrete de consulta reconhecida antes da Nina",
                      });
                    } catch {
                      /* rastreabilidade nunca interrompe o atendimento */
                    }
                    continue;
                  }
                } catch (e) {
                  // Falha aqui não pode engolir a mensagem do paciente.
                  console.error("[confirmacao] reconhecimento falhou", e);
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
                    const { reconhecerCodigoVerificacao } =
                      await import("@/lib/integracoes/verificacao-v1.server");
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
                        await metaSendText(phoneNumberId, cfg.access_token, from, r.resposta).catch(
                          (e) => console.error("[verificacao] resposta ao paciente falhou", e),
                        );
                      }
                      resultado = "verificacao_tratada";
                      // FASE 1 — resposta determinística ANTES da Nina: fica
                      // registrada como caminho sem modelo.
                      try {
                        const { registrarTurnoSemModelo } =
                          await import("@/lib/nina/rastreio/turno.server");
                        await registrarTurnoSemModelo({
                          clinicaId: params.clinicaId,
                          conversaId: null,
                          ...(idMsg ? { mensagensEntrada: [idMsg] } : {}),
                          origem: r.resposta ? "gate" : "nenhuma",
                          motivo: "código de verificação reconhecido antes da Nina",
                        });
                      } catch {
                        /* rastreabilidade nunca interrompe o atendimento */
                      }
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
                  const { processarTimeoutsEsperaPaciente } =
                    await import("@/lib/nina/espera-timeout.server");
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
                  const { reabrirConversaPorMensagemPaciente } =
                    await import("@/lib/atendimento/handoff.server");
                  await reabrirConversaPorMensagemPaciente({
                    clinicaId: params.clinicaId,
                    telefone: fromDigits,
                    ...(entradaPersistida.repetida
                      ? { mensagemRecebidaEm: msgInserida.created_at ?? "" }
                      : {}),
                  });
                  // O paciente respondeu: qualquer prazo de espera cai.
                  const { limparEsperaPorTelefone } =
                    await import("@/lib/nina/espera-paciente.server");
                  if (!entradaPersistida.repetida)
                    await limparEsperaPorTelefone(params.clinicaId, fromDigits);
                }

                // Atendimento híbrido: a Nina é o 1º nível e responde sempre,
                // MENOS quando a conversa já está com uma pessoa (ou na fila
                // aguardando alguém assumir). O dono da conversa manda.
                const { estadoConversaPorTelefone, ninaPodeResponder } =
                  await import("@/lib/atendimento/handoff.server");
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
                  (convEstado as { atribuida_user_id?: string | null } | null)?.atribuida_user_id ??
                  null;
                if (!deveResponder && convId && !jaTemDono) {
                  try {
                    const { atribuirAtendenteOnline } =
                      await import("@/lib/atendimento/handoff.server");
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
                  const { processarRespostaWhatsappNina } =
                    await import("@/lib/nina/whatsapp-processamento.server");
                  const processamento = await processarRespostaWhatsappNina({
                    clinicaId: params.clinicaId,
                    cfg: { ...cfg, access_token: cfg.access_token },
                    phoneNumberId,
                    displayPhoneNumber: displayPhoneNumber ?? null,
                    webhookPhoneNumberId,
                    from,
                    fromDigits,
                    convId,
                    msgInserida,
                    textoPaciente,
                    audioFalhou,
                    ehAudio,
                    tipo,
                  });
                  if (processamento.resultado) resultado = processamento.resultado;
                  if (processamento.pendente)
                    return new Response("Message pending safe retry", { status: 503 });
                  if (processamento.agrupada) continue;
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
          const { ErroAgrupamentoNina } = await import("@/lib/nina/agrupamento-turno");
          if (e instanceof ErroAgrupamentoNina && e.podeRepetirEntrada)
            return new Response("Message pending safe retry", { status: 503 });
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
