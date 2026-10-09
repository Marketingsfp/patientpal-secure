import { createFileRoute } from "@tanstack/react-router";
import { nomeArquivoSeguro, textoDoDocumento } from "@/lib/whatsapp-midia-armazenamento";
import { createHmac, timingSafeEqual } from "crypto";
import { loadWhatsAppConfig, metaSendText } from "@/lib/whatsapp.server";
import { bloquearLinksRecebidos } from "@/lib/atendimento/links-entrada";
import { decidirAssinaturaWebhook } from "@/lib/whatsapp-assinatura";

function verifySignature(
  appSecret: string,
  rawBody: Uint8Array,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !/^sha256=[a-fA-F0-9]{64}$/.test(signatureHeader)) return false;
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
        // A assinatura autentica os bytes recebidos, antes da decodificação do JSON.
        const rawBodyBytes = new Uint8Array(await request.arrayBuffer());
        const rawBody = new TextDecoder().decode(rawBodyBytes);
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
          // Recusa antes de processar mensagens ou recibos. Somente o log
          // técnico da tentativa é permitido sem autenticação.
          const assinaturaOk = Boolean(
            cfg.app_secret && verifySignature(cfg.app_secret, rawBodyBytes, sigHeader),
          );
          const decisaoAssinatura = decidirAssinaturaWebhook({
            appSecretConfigurado: Boolean(cfg.app_secret),
            assinaturaOk,
          });
          if (!decisaoAssinatura.processar) {
            resultado = decisaoAssinatura.resultado ?? "erro:aviso recusado";
            console.error("[whatsapp] aviso recusado: assinatura da Meta não confere", {
              clinica_id: params.clinicaId,
            });
            return new Response("Invalid signature", { status: 401 });
          }
          if (decisaoAssinatura.resultado) resultado = decisaoAssinatura.resultado;
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
                if (assinaturaOk) {
                  try {
                    const { registrarEntregaFrancisco } =
                      await import("@/lib/francisco/replies.server");
                    await registrarEntregaFrancisco(params.clinicaId, statuses);
                  } catch {
                    console.error("[francisco] Falha ao registrar recibo de entrega.");
                  }
                }
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
                const ehImagem = tipo === "image";
                const ehDocumento = tipo === "document";
                const ehVideo = tipo === "video";
                const chamadasIA: import("@/lib/nina/auditoria-ia").ChamadaIA[] = [];
                const registrarIA = (c: import("@/lib/nina/auditoria-ia").ChamadaIA) => {
                  chamadasIA.push(c);
                };

                // Texto do paciente que a Nina vai processar (áudio vira transcrição).
                let textoPaciente = tipo === "text" ? String(msg.text?.body ?? "") : "";
                let transcricao: string | null = null;
                let audioFalhou = false;
                let mediaMime: string | null = null;
                // Caminho do arquivo no bucket privado (imagem e áudio recebidos).
                let caminhoMidia: string | null = null;
                // Classificação persistida: o núcleo controla leitura, nova tentativa e encaminhamento.
                let leituraImagem: import("@/lib/nina/leitura-imagem").LeituraImagem = {
                  tipo: "falha_tecnica",
                  motivo: "download",
                };
                const legendaImagem = ehImagem
                  ? bloquearLinksRecebidos(String(msg.image?.caption ?? "").trim())
                  : "";

                if (ehAudio || ehImagem || ehDocumento || ehVideo) {
                  // Mantém o armazenamento em dia: apaga só o que passou dos 5 anos de guarda (no máx. a cada hora).
                  const { limparMidiasExpiradasSeChegouAHora } =
                    await import("@/lib/whatsapp-midia.server");
                  await limparMidiasExpiradasSeChegouAHora(params.clinicaId);
                }

                const imagemExistente = ehImagem
                  ? await supabaseAdmin
                      .from("whatsapp_mensagens")
                      .select("id,transcricao,media_url,media_mime,raw")
                      .eq("clinica_id", params.clinicaId)
                      .eq("wa_message_id", wa_message_id)
                      .maybeSingle()
                  : null;
                if (imagemExistente?.error)
                  throw new Error("Não foi possível conferir a foto recebida anteriormente");
                if (imagemExistente?.data) {
                  const { leituraSalvaDaFoto } = await import("@/lib/nina/fotos");
                  leituraImagem = leituraSalvaDaFoto(imagemExistente.data.raw) ?? {
                    tipo: "falha_tecnica",
                    motivo: "resposta_invalida",
                  };
                  caminhoMidia = imagemExistente.data.media_url;
                  mediaMime = imagemExistente.data.media_mime;
                }
                if (ehImagem && cfg.access_token && !imagemExistente?.data) {
                  const mediaId = String(msg.image?.id ?? "");
                  if (mediaId) {
                    const { receberMidiaWhatsapp, lerPedidoNaImagem } =
                      await import("@/lib/whatsapp-midia.server");
                    const recebida = await receberMidiaWhatsapp({
                      clinicaId: params.clinicaId,
                      waMessageId: wa_message_id,
                      tipo: "image",
                      mediaId,
                      accessToken: cfg.access_token,
                    });
                    mediaMime = recebida.mime;
                    caminhoMidia = recebida.caminho;
                    if (recebida.erro) console.error("recebimento de imagem falhou", recebida.erro);
                    // A IA só lê a imagem quando a Nina vai mesmo responder (conversa de gente
                    // ou Nina desligada: a imagem não sai do sistema).
                    if (recebida.base64 && recebida.mime?.startsWith("image/")) {
                      const {
                        estadoConversaPorTelefone: estadoAntes,
                        ninaPodeResponder: podeAntes,
                      } = await import("@/lib/atendimento/handoff.server");
                      const { ninaDesativadaNaClinica: desligadaAntes } =
                        await import("@/lib/nina-desligada.server");
                      const estado = from ? await estadoAntes(params.clinicaId, from) : null;
                      if (podeAntes(estado) && !(await desligadaAntes(params.clinicaId))) {
                        leituraImagem = await lerPedidoNaImagem(
                          recebida.base64,
                          recebida.mime,
                          registrarIA,
                        );
                      }
                    }
                  }
                }

                // Documento e vídeo: guardados para consulta (5 anos). A Nina não os lê.
                let nomeDocumento = "";
                let legendaArquivo = "";
                if ((ehDocumento || ehVideo) && cfg.access_token) {
                  const origem = ehDocumento ? msg.document : msg.video;
                  const mediaId = String(origem?.id ?? "");
                  nomeDocumento = ehDocumento ? nomeArquivoSeguro(origem?.filename) : "";
                  legendaArquivo = String(origem?.caption ?? "").trim();
                  if (mediaId) {
                    const { receberArquivoWhatsapp } = await import("@/lib/whatsapp-midia.server");
                    const arquivo = await receberArquivoWhatsapp({
                      clinicaId: params.clinicaId,
                      waMessageId: wa_message_id,
                      tipo: ehDocumento ? "document" : "video",
                      mediaId,
                      accessToken: cfg.access_token,
                      mimeInformado: origem?.mime_type ?? null,
                    });
                    mediaMime = arquivo.mime;
                    caminhoMidia = arquivo.caminho;
                    if (arquivo.erro) console.error("recebimento de arquivo falhou", arquivo.erro);
                  }
                }
                if (ehImagem) {
                  const { textoDaImagem } = await import("@/lib/nina/leitura-imagem");
                  textoPaciente = textoDaImagem(leituraImagem, legendaImagem);
                  transcricao = textoPaciente;
                }

                if (ehAudio && cfg.access_token) {
                  const mediaId = String(msg.audio?.id ?? msg.voice?.id ?? "");
                  if (mediaId) {
                    const { receberMidiaWhatsapp, transcreverAudioBase64 } =
                      await import("@/lib/whatsapp-midia.server");
                    const recebido = await receberMidiaWhatsapp({
                      clinicaId: params.clinicaId,
                      waMessageId: wa_message_id,
                      tipo: "audio",
                      mediaId,
                      accessToken: cfg.access_token,
                    });
                    caminhoMidia = recebido.caminho;
                    const r = recebido.base64
                      ? await transcreverAudioBase64(recebido.base64, recebido.mime, registrarIA)
                      : { texto: "", erro: recebido.erro };
                    mediaMime = recebido.mime;
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
                    : ehImagem
                      ? legendaImagem
                        ? `📷 ${legendaImagem}`
                        : "📷 Imagem"
                      : ehDocumento
                        ? textoDoDocumento(nomeDocumento, legendaArquivo)
                        : ehVideo
                          ? legendaArquivo
                            ? `🎞️ ${legendaArquivo}`
                            : "🎞️ Vídeo"
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
                  media_url: caminhoMidia,
                  status: "received",
                  enviada_por: "paciente",
                  raw: {
                    ...msg,
                    ...(ehImagem ? { nina_leitura_imagem: leituraImagem } : {}),
                    nina_chamadas_ia: chamadasIA,
                  },
                });
                const msgInserida = entradaPersistida.mensagem;
                trace.marcar("RECV_T5_DB_INSERT_DONE");
                trace.marcar("RECV_T6_REALTIME_AVAILABLE");
                if (entradaPersistida.consumida) {
                  resultado = "duplicada_ignorada";
                  continue;
                }
                {
                  // Sempre usa a entrada protegida, também no primeiro recebimento.
                  // Retry reutiliza o conteúdo persistido, não o payload reenviado.
                  textoPaciente =
                    msgInserida.tipo === "audio" || msgInserida.tipo === "image"
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

                // Francisco trata respostas antes de qualquer automação da Nina.
                if (assinaturaOk) {
                  try {
                    const { processarRespostaFrancisco } =
                      await import("@/lib/francisco/replies.server");
                    const tratada = await processarRespostaFrancisco({
                      clinicaId: params.clinicaId,
                      from,
                      mensagemId: msgInserida.id,
                      waMessageId: wa_message_id,
                      contextoId: (msgInserida.raw as any)?.context?.id,
                      texto: textoPaciente,
                      recebidaEm: msgInserida.recebida_em,
                    });
                    if (tratada) {
                      const marcada = await supabaseAdmin
                        .from("whatsapp_mensagens")
                        .update({
                          nina_status: tratada.destino === "encerrado" ? "completed" : "handoff",
                          ...(tratada.destino === "encerrado"
                            ? { tratada_internamente: true }
                            : {}),
                        })
                        .eq("id", msgInserida.id)
                        .eq("clinica_id", params.clinicaId);
                      if (marcada.error) throw marcada.error;
                      continue;
                    }
                  } catch {
                    const { ErroAgrupamentoNina } = await import("@/lib/nina/agrupamento-turno");
                    throw new ErroAgrupamentoNina(
                      "Resposta ao Francisco aguarda encaminhamento seguro para a equipe.",
                    );
                  }
                }

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

                // Mensagem nova do paciente reabre automaticamente a conversa
                // encerrada e devolve o atendimento ao fluxo inicial da Nina.
                const fromDigits = String(from ?? "").replace(/\D/g, "");
                if (fromDigits) {
                  const { reabrirConversaPorMensagemPaciente } =
                    await import("@/lib/atendimento/handoff.server");
                  await reabrirConversaPorMensagemPaciente({
                    clinicaId: params.clinicaId,
                    telefone: fromDigits,
                    mensagemOrigemId: msgInserida.id,
                    ...(entradaPersistida.repetida
                      ? { mensagemRecebidaEm: msgInserida.created_at ?? "" }
                      : {}),
                  });
                  // O paciente respondeu: qualquer prazo de espera cai.
                  const { limparEsperaPorTelefone } =
                    await import("@/lib/nina/espera-paciente.server");
                  if (!entradaPersistida.repetida)
                    await limparEsperaPorTelefone(
                      params.clinicaId,
                      fromDigits,
                      msgInserida.created_at,
                    );
                }

                // O retorno já persistido cancela a espera ANTES da varredura.
                // O cron também executa isto sem depender de mensagens novas.
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

          if (processou) resultado = "processado_ok";
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
