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

          let payload: any;
          try {
            payload = JSON.parse(rawBody);
          } catch {
            resultado = "erro:corpo não é JSON válido";
            return new Response("Bad request", { status: 400 });
          }

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
                const { error: insErr } = await supabaseAdmin
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
                  });
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
                  try {
                    if (!phoneNumberId) {
                      throw new Error(
                        "WhatsApp não configurado: Phone Number ID ausente na configuração e no webhook da Meta.",
                      );
                    }
                    const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } =
                      await import("@/lib/whatsapp-midia.server");
                    let reply = "";
                    if (textoPaciente) {
                      reply = await gerarRespostaNina(params.clinicaId, textoPaciente, from);
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
                      if (!ninaPodeResponder(agora)) reply = "";
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
                        await supabaseAdmin.from("whatsapp_mensagens").insert({
                          clinica_id: params.clinicaId,
                          wa_message_id: outId,
                          direction: "out",
                          from_number: displayPhoneNumber,
                          to_number: from,
                          body: reply,
                          tipo: "text",
                          status: "sent",
                          enviada_por: "nina",
                        });
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
                  }
                }

                // Nome do perfil do WhatsApp (vem em value.contacts[].profile.name).
                // Só preenche quando a conversa ainda não tem nome ou está
                // mostrando o próprio número — nunca sobrescreve um nome que a
                // recepção digitou nem o nome do paciente já vinculado.
                const perfilNome = textoLimpo(
                  (value?.contacts ?? []).find(
                    (c: any) => String(c?.wa_id ?? "").replace(/\D/g, "") === fromDigits,
                  )?.profile?.name ?? (value?.contacts ?? [])[0]?.profile?.name,
                );
                if (perfilNome && fromDigits) {
                  try {
                    const { data: convs } = await supabaseAdmin
                      .from("atend_conversas")
                      .select("id, contato_nome, contato_telefone")
                      .eq("clinica_id", params.clinicaId)
                      .in("contato_telefone", [fromDigits, `+${fromDigits}`]);
                    for (const c of (convs ?? []) as Array<{
                      id: string;
                      contato_nome: string | null;
                    }>) {
                      const atual = (c.contato_nome ?? "").trim();
                      // vazio ou apenas dígitos/“+” = ainda está mostrando o número
                      const soNumero = atual === "" || /^\+?\d+$/.test(atual);
                      if (!soNumero) continue;
                      await supabaseAdmin
                        .from("atend_conversas")
                        .update({ contato_nome: perfilNome.slice(0, 120) })
                        .eq("id", c.id);
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
        }
      },
    },
  },
});
